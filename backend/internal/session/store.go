// backend/internal/session/store.go
package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
)

// ClusterInfo describes the cluster a session is currently connected to.
type ClusterInfo struct {
	Server         string
	Version        string
	CurrentContext string
}

// Session holds all per-user state: app-level auth and an optional
// cluster connection. It is never persisted to disk.
type Session struct {
	ID            string
	Authenticated bool
	Clientset     kubernetes.Interface
	ClusterInfo   *ClusterInfo
	LastAccess    time.Time
}

// Store is an in-memory, TTL-based session store.
type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
	ttl      time.Duration
}

func NewStore(ttl time.Duration) *Store {
	return &Store{sessions: make(map[string]*Session), ttl: ttl}
}

func (s *Store) Create() *Session {
	sess := &Session{ID: newID(), LastAccess: time.Now()}
	s.mu.Lock()
	s.sessions[sess.ID] = sess
	s.mu.Unlock()
	return sess
}

func (s *Store) Get(id string) (*Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, false
	}
	sess.LastAccess = time.Now()
	return sess, true
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	delete(s.sessions, id)
	s.mu.Unlock()
}

// RemoveExpired deletes sessions idle longer than the store's TTL,
// relative to now. It returns the number of sessions removed.
func (s *Store) RemoveExpired(now time.Time) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	for id, sess := range s.sessions {
		if now.Sub(sess.LastAccess) > s.ttl {
			delete(s.sessions, id)
			removed++
		}
	}
	return removed
}

// StartJanitor runs RemoveExpired on a fixed interval until done is closed.
func (s *Store) StartJanitor(interval time.Duration, done <-chan struct{}) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				s.RemoveExpired(time.Now())
			}
		}
	}()
}

func newID() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

type contextKey struct{}

// NewContext returns a copy of ctx carrying sess.
func NewContext(ctx context.Context, sess *Session) context.Context {
	return context.WithValue(ctx, contextKey{}, sess)
}

// FromContext extracts a *Session previously stored with NewContext.
func FromContext(ctx context.Context) (*Session, bool) {
	sess, ok := ctx.Value(contextKey{}).(*Session)
	return sess, ok
}
