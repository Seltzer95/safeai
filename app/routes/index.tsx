import { createFileRoute } from '@tanstack/react-router'
import { NotesApp } from '~/components/NotesApp'

export const Route = createFileRoute('/')({
  component: NotesApp,
})
