import {
  AlertCircleIcon,
  ChevronLeftIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Separator } from '~/components/ui/separator'
import { Textarea } from '~/components/ui/textarea'
import type { Note } from '~/data/notes'
import { useAIActions } from '~/hooks/useAIActions'
import { useNotes } from '~/hooks/useNotes'
import { useRelatedNotes } from '~/hooks/useRelatedNotes'
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
  const {
    notes,
    embeddingIds,
    modelStatus,
    modelProgress,
    modelError,
    createNote,
    updateNote,
    deleteNote,
    loadDemoNotes,
  } = useNotes()
  const { rankNotes } = useAIActions()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [localTitle, setLocalTitle] = useState('')
  const [localBody, setLocalBody] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [isLoadingDemo, setIsLoadingDemo] = useState(false)

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
  }, [selectedId, notes])

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

  const handleLoadDemo = async (): Promise<void> => {
    setIsLoadingDemo(true)
    try {
      await loadDemoNotes()
    } finally {
      setIsLoadingDemo(false)
    }
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

  // ── Responsive visibility ────────────────────────────────────────────────────
  // Mobile: show sidebar (list) OR main (editor/welcome), never both.
  // Desktop (md+): always show both.
  const isEmpty = sortedNotes.length === 0
  const sidebarVisible = !selectedId && !isEmpty // mobile: sidebar when browsing notes
  const mainVisible = !!selectedId || isEmpty // mobile: main when editing or empty/welcome

  return (
    <div className="flex h-svh bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={cn(
          'flex flex-col border-r',
          'md:flex md:w-64 md:shrink-0',
          sidebarVisible ? 'flex w-full' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">SafeAI Notes</h1>
          <Button size="sm" variant="outline" onClick={() => void handleNewNote()}>
            <PlusIcon className="mr-1 h-3.5 w-3.5" />
            New
          </Button>
        </div>

        {/* Model loading banner */}
        {modelStatus === 'loading' && (
          <div className="border-b bg-muted/40 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <Loader2Icon className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
              <span className="text-xs font-medium">Loading AI model</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {modelProgress}%
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/50 transition-all duration-300"
                style={{ width: `${modelProgress}%` }}
              />
            </div>
            {modelProgress < 10 && (
              <p className="mt-1.5 text-xs text-muted-foreground/70">
                First-time setup — downloads ~23 MB
              </p>
            )}
          </div>
        )}

        {/* Model error banner */}
        {modelStatus === 'error' && (
          <div className="border-b bg-destructive/10 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <AlertCircleIcon className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="text-xs font-medium text-destructive">AI model failed to load</span>
            </div>
            {modelError && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{modelError}</p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Search and suggestions unavailable.
            </p>
          </div>
        )}

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
              placeholder={modelStatus === 'ready' ? 'Semantic search…' : 'Loading model…'}
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
            <div className="px-4 py-6 text-center">
              {searchResults !== null ? (
                <>
                  <p className="text-sm text-muted-foreground">No results for</p>
                  <p className="mt-0.5 text-sm font-medium">"{searchQuery}"</p>
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    Try different keywords or browse all notes.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </div>
          ) : (
            <ul className="w-full">
              {sidebarItems.map(({ note, score }) => (
                <li
                  key={note.id}
                  className={cn('group relative overflow-hidden border-b', selectedId === note.id && 'bg-muted')}
                >
                  {/* Selection area — full-width button, right-padded to clear delete button */}
                  <button
                    type="button"
                    onClick={() => void selectNote(note)}
                    className="w-full cursor-pointer px-4 py-3 pr-10 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {note.title || 'Untitled'}
                      </span>
                      {embeddingIds.has(note.id) && (
                        <Loader2Icon className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                      )}
                      {score !== undefined && (
                        <Badge variant="outline" className="shrink-0 px-1 py-0 text-xs font-normal">
                          {Math.round(score * 100)}%
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {snippet(note.body)}
                    </p>
                    {score === undefined && (
                      <p className="mt-1 text-xs text-muted-foreground/50">
                        {formatRelativeTime(note.updatedAt)}
                      </p>
                    )}
                  </button>
                  {/* Delete button — absolutely positioned, sibling to the select button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-6 w-6 shrink-0 opacity-40 transition-opacity group-hover:opacity-100"
                    onClick={(e) => void handleDelete(note.id, e)}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* ── Editor ──────────────────────────────────────────── */}
      <main
        className={cn(
          'flex flex-1 flex-col overflow-hidden',
          'md:flex',
          mainVisible ? 'flex' : 'hidden',
        )}
      >
        {selectedNote ? (
          <>
            {/* Mobile back button */}
            <div className="flex items-center border-b px-3 py-2 md:hidden">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                All Notes
              </button>
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between border-b px-6 py-2 md:px-8">
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
                {modelStatus === 'loading' && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Loader2Icon className="h-3 w-3 animate-spin" />
                    Model loading
                  </Badge>
                )}
                {modelStatus === 'error' && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertCircleIcon className="h-3 w-3" />
                    Model error
                  </Badge>
                )}
              </div>
            </div>

            {/* Editable fields */}
            <div className="flex flex-1 flex-col gap-3 overflow-auto px-6 py-6 md:px-8">
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
              {modelStatus !== 'idle' && (
                <>
                  <Separator />
                  <div className="pb-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Related</p>
                    {modelStatus === 'loading' && !selectedNote.embedding ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2Icon className="h-3 w-3 animate-spin" />
                        AI model loading — related notes will appear once ready
                      </p>
                    ) : embeddingIds.has(selectedNote.id) ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2Icon className="h-3 w-3 animate-spin" />
                        Analyzing note…
                      </p>
                    ) : modelStatus === 'error' ? (
                      <p className="text-xs text-muted-foreground/60">
                        Unavailable — model failed to load.
                      </p>
                    ) : relatedNotes.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">
                        {selectedNote.embedding
                          ? 'No similar notes found.'
                          : 'Note not yet analyzed.'}
                      </p>
                    ) : (
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
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : isEmpty ? (
          // ── Welcome / empty state ────────────────────────────────────────────
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <SparklesIcon className="h-7 w-7 text-muted-foreground" />
            </div>

            <div className="max-w-xs">
              <h2 className="text-lg font-semibold">Welcome to SafeAI Notes</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Notes with semantic search and AI-powered connections — everything runs locally in
                your browser.
              </p>
            </div>

            <div className="flex w-full max-w-xs flex-col gap-2">
              <Button
                onClick={() => void handleLoadDemo()}
                disabled={isLoadingDemo}
                className="w-full"
              >
                {isLoadingDemo ? (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <SparklesIcon className="mr-2 h-4 w-4" />
                )}
                {isLoadingDemo ? 'Loading…' : 'Load demo notes'}
              </Button>
              <Button variant="outline" onClick={() => void handleNewNote()} className="w-full">
                <PlusIcon className="mr-2 h-4 w-4" />
                Start from scratch
              </Button>
            </div>

            {modelStatus === 'loading' && (
              <p className="max-w-xs text-xs text-muted-foreground">
                <Loader2Icon className="mr-1 inline h-3 w-3 animate-spin" />
                AI model downloading ({modelProgress}%)
                {modelProgress < 10 && ' — first-time setup, ~23 MB'}
              </p>
            )}
            {modelStatus === 'error' && (
              <p className="max-w-xs text-xs text-destructive">
                <AlertCircleIcon className="mr-1 inline h-3 w-3" />
                AI model failed to load. Notes still work, but search won't be available.
              </p>
            )}
          </div>
        ) : (
          // ── No note selected ─────────────────────────────────────────────────
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm">Select a note to start editing</p>
          </div>
        )}
      </main>
    </div>
  )
}
