import { useState, useEffect, useRef, useCallback } from 'react'
import { useNotes } from '~/hooks/useNotes'
import { useAIActions } from '~/hooks/useAIActions'
import { useRelatedNotes } from '~/hooks/useRelatedNotes'
import type { Note } from '~/data/notes'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Badge } from '~/components/ui/badge'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import {
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  SearchIcon,
  XIcon,
} from 'lucide-react'
import { cn } from '~/lib/utils'

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function snippet(body: string): string {
  const trimmed = body.trim()
  return trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed || 'No content'
}

type SaveStatus = 'saved' | 'saving' | 'unsaved'

export function NotesApp() {
  const { notes, embeddingIds, modelStatus, createNote, updateNote, deleteNote } = useNotes()
  const { rankNotes } = useAIActions()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localTitle, setLocalTitle] = useState('')
  const [localBody, setLocalBody] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ noteId: string; score: number }[] | null>(
    null,
  )
  const [isSearching, setIsSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ title: string; body: string } | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )

  // ── Semantic search ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }
    if (modelStatus !== 'ready') return

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await rankNotes(searchQuery, notes)
        setSearchResults(results)
      } catch (err) {
        console.error('[NotesApp] search failed:', err)
        setSearchResults(null)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery, notes, modelStatus, rankNotes])

  // Clear search results when query is cleared
  useEffect(() => {
    if (!searchQuery) setSearchResults(null)
  }, [searchQuery])

  // ── Save / select helpers ────────────────────────────────────────────────────

  const flushSave = useCallback(async (): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const id = selectedIdRef.current
    if (id && pendingRef.current) {
      setSaveStatus('saving')
      await updateNote(id, pendingRef.current)
      pendingRef.current = null
      setSaveStatus('saved')
    }
  }, [updateNote])

  const selectNote = useCallback(
    async (note: Note): Promise<void> => {
      await flushSave()
      setSelectedId(note.id)
      setLocalTitle(note.title)
      setLocalBody(note.body)
      setSaveStatus('saved')
    },
    [flushSave],
  )

  // Sync local fields when the selected note is updated externally (e.g. after embed refresh)
  // but only if there's no pending local edit in flight
  useEffect(() => {
    const note = notes.find((n) => n.id === selectedId)
    if (note && !pendingRef.current) {
      setLocalTitle(note.title)
      setLocalBody(note.body)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const scheduleSave = useCallback(
    (title: string, body: string): void => {
      pendingRef.current = { title, body }
      setSaveStatus('unsaved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const id = selectedIdRef.current
        if (id && pendingRef.current) {
          setSaveStatus('saving')
          void updateNote(id, pendingRef.current).then(() => {
            pendingRef.current = null
            setSaveStatus('saved')
          })
        }
      }, 900)
    },
    [updateNote],
  )

  const handleTitleChange = (value: string): void => {
    setLocalTitle(value)
    scheduleSave(value, localBody)
  }

  const handleBodyChange = (value: string): void => {
    setLocalBody(value)
    scheduleSave(localTitle, value)
  }

  const handleNewNote = async (): Promise<void> => {
    await flushSave()
    const note = await createNote({ title: '', body: '', tags: [] })
    setSelectedId(note.id)
    setLocalTitle(note.title)
    setLocalBody(note.body)
    setSaveStatus('saved')
  }

  const handleDelete = async (id: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (selectedId === id) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      pendingRef.current = null
      setSelectedId(null)
      setLocalTitle('')
      setLocalBody('')
    }
    await deleteNote(id)
  }

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null
  const relatedNotes = useRelatedNotes(selectedNote, notes)

  // ── Sidebar note items ───────────────────────────────────────────────────────

  // When search is active, show ranked results; otherwise show all notes sorted by date
  const sidebarItems: { note: Note; score?: number }[] = (() => {
    if (searchResults !== null) {
      return searchResults
        .map((r) => {
          const note = notes.find((n) => n.id === r.noteId)
          return note ? { note, score: r.score } : null
        })
        .filter((item): item is { note: Note; score: number } => item !== null)
    }
    return sortedNotes.map((note) => ({ note }))
  })()

  return (
    <div className="flex h-svh bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">SafeAI Notes</h1>
          <Button size="sm" variant="outline" onClick={() => void handleNewNote()}>
            <PlusIcon className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
        </div>

        {/* Search box */}
        <div className="border-b px-3 py-2">
          <div className="relative">
            {isSearching ? (
              <Loader2Icon className="absolute left-2.5 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <SearchIcon className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                modelStatus === 'ready' ? 'Semantic search…' : 'Loading model…'
              }
              disabled={modelStatus !== 'ready'}
              className="h-7 pl-7 pr-6 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5"
                aria-label="Clear search"
              >
                <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {searchResults !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <ScrollArea className="flex-1">
          {sidebarItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {searchResults !== null ? 'No matching notes' : 'No notes yet'}
            </p>
          ) : (
            sidebarItems.map(({ note, score }) => (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => void selectNote(note)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') void selectNote(note)
                }}
                className={cn(
                  'group w-full cursor-pointer border-b px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  selectedId === note.id && 'bg-muted',
                )}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {note.title || 'Untitled'}
                      </span>
                      {embeddingIds.has(note.id) && (
                        <Loader2Icon className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                      )}
                      {score !== undefined && (
                        <Badge
                          variant="outline"
                          className="ml-auto shrink-0 px-1 py-0 text-xs font-normal"
                        >
                          {Math.round(score * 100)}%
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {snippet(note.body)}
                    </p>
                    {!score && (
                      <p className="mt-1 text-xs text-muted-foreground/50">
                        {formatRelativeTime(note.updatedAt)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => void handleDelete(note.id, e)}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </aside>

      {/* ── Editor ──────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {selectedNote ? (
          <>
            {/* Status bar */}
            <div className="flex items-center justify-between border-b px-8 py-2">
              <span
                className={cn(
                  'text-xs transition-colors',
                  saveStatus === 'unsaved' && 'text-amber-500',
                  saveStatus === 'saving' && 'text-muted-foreground',
                  saveStatus === 'saved' && 'text-muted-foreground/50',
                )}
              >
                {saveStatus === 'saving' && 'Saving…'}
                {saveStatus === 'unsaved' && 'Unsaved'}
                {saveStatus === 'saved' && 'Saved'}
              </span>

              <div className="flex items-center gap-1.5">
                {modelStatus !== 'ready' && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {modelStatus === 'loading' && (
                      <Loader2Icon className="h-3 w-3 animate-spin" />
                    )}
                    Model {modelStatus}
                  </Badge>
                )}
              </div>
            </div>

            {/* Editable fields */}
            <div className="flex flex-1 flex-col gap-3 overflow-auto px-8 py-6">
              <Input
                value={localTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Untitled"
                className="h-auto border-none p-0 text-2xl font-bold shadow-none focus-visible:ring-0"
              />

              {/* Tags */}
              {selectedNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedNote.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <Separator />

              <Textarea
                value={localBody}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Start writing…"
                className="min-h-80 flex-1 resize-none border-none p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
              />

              {/* Related notes */}
              {relatedNotes.length > 0 && (
                <>
                  <Separator />
                  <div className="pb-2">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Related notes</p>
                    <div className="flex flex-col gap-0.5">
                      {relatedNotes.map(({ note, score }) => (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => void selectNote(note)}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                        >
                          <span className="truncate text-sm">{note.title || 'Untitled'}</span>
                          <Badge
                            variant="outline"
                            className="ml-2 shrink-0 px-1 py-0 text-xs font-normal"
                          >
                            {Math.round(score * 100)}%
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            {sortedNotes.length === 0 ? (
              <>
                <p className="text-sm">No notes yet.</p>
                <Button variant="outline" size="sm" onClick={() => void handleNewNote()}>
                  <PlusIcon className="mr-1.5 h-4 w-4" />
                  Create your first note
                </Button>
              </>
            ) : (
              <p className="text-sm">Select a note to start editing</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
