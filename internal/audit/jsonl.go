package audit

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type JSONLSink struct {
	path string
	mu   sync.Mutex
}
type legacyRecord struct {
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	Payload   any       `json:"payload"`
}

func NewJSONLSink(path string) (*JSONLSink, error) {
	if path == "" {
		return nil, errors.New("audit path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	return &JSONLSink{path: path}, nil
}
func (s *JSONLSink) Write(t string, p any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, e := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		return e
	}
	defer f.Close()
	if e = json.NewEncoder(f).Encode(legacyRecord{Type: t, Timestamp: time.Now().UTC(), Payload: p}); e != nil {
		return fmt.Errorf("encode audit record: %w", e)
	}
	return f.Sync()
}
