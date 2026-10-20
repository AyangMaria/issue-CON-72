package repositorysecurity

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestLoadGitIndexAcceptsLiteralRouteNames(t *testing.T) {
	root := t.TempDir()
	runGitForTest(t, root, "init", "--quiet")
	paths := []string{
		"ui/src/app/recommendations/[id]/page.tsx",
		"ui/src/app/docs/[...slug]/page.tsx",
		"ui/src/app/docs/[[...slug]]/page.tsx",
	}
	// This must still be scanned for client-side configuration exposure,
	// even though its filename contains characters used in glob patterns.
	content := []byte("\"use client\"; export const value = process.env.DATABASE_URL;\n")
	for _, path := range paths {
		fullPath := filepath.Join(root, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(fullPath, content, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	runGitForTest(t, root, "add", "--", ".")
	runGitForTest(t, root, "-c", "user.name=Scanner Test", "-c", "user.email=scanner-test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Add route fixtures")

	files, revision, err := LoadGitIndex(context.Background(), root)
	if err != nil {
		t.Fatalf("load literal route filenames: %v", err)
	}
	if revision == "" || len(files) != len(paths) {
		t.Fatalf("expected a revision and %d tracked routes; got revision %q and %d files", len(paths), revision, len(files))
	}
	byPath := make(map[string]TrackedFile, len(files))
	for _, file := range files {
		byPath[file.Path] = file
	}
	for _, path := range paths {
		file, found := byPath[path]
		if !found || !file.ContentSet || string(file.Content) != string(content) {
			t.Fatalf("route %q was not loaded with its indexed content", path)
		}
		if !hasRule(scanContent(file), "server-config-in-client") {
			t.Fatalf("route %q escaped content scanning", path)
		}
	}
}

func TestDeclarationPathsStillRejectPatterns(t *testing.T) {
	for _, path := range []string{
		"ui/src/app/recommendations/[id]/page.tsx",
		"ui/src/app/docs/[...slug]/page.tsx",
		"ui/src/app/docs/[[...slug]]/page.tsx",
		"fixtures/*.txt",
		"fixtures/token?.txt",
		"fixtures/{one,two}.txt",
	} {
		t.Run(path, func(t *testing.T) {
			if exactRelativePath(path) {
				t.Fatal("security declarations must continue rejecting pattern characters")
			}
		})
	}
}

func TestTrackedPathsStayInsideRepository(t *testing.T) {
	for _, path := range []string{
		"",
		".",
		"..",
		"../outside.tsx",
		"ui/../../outside.tsx",
		"ui/../page.tsx",
		"./ui/page.tsx",
		"ui//page.tsx",
		"ui/page.tsx/",
		"/outside.tsx",
		filepath.ToSlash(filepath.Join(t.TempDir(), "outside.tsx")),
	} {
		t.Run(path, func(t *testing.T) {
			if trackedRelativePath(path) {
				t.Fatal("accepted an unsafe or non-canonical tracked path")
			}
		})
	}
}

func runGitForTest(t *testing.T, root string, args ...string) {
	t.Helper()
	command := exec.Command("git", append([]string{"-C", root}, args...)...)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}
