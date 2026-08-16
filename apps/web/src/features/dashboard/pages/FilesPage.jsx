import DocumentsTab from '../../medical-documents/components/DocumentsTab.jsx'

// File Storage tab. DocumentsTab is self-contained (loads the user's vault files
// from the backend), so no props are needed.
export default function FilesPage() {
  return <DocumentsTab />
}
