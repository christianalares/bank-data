import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'

import { cn } from '#/lib/utils'

const ACCEPTED_TYPES = {
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  'application/pdf': ['.pdf'],
}

type Props = {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export function UploadZone({ onFiles, disabled }: Props) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) {
        onFiles(accepted)
      }
    },
    [onFiles],
  )

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: ACCEPTED_TYPES,
    disabled,
    multiple: true,
    onDrop,
    onDropRejected: () => {
      toast.error('Only images and PDF files are allowed')
    },
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center border border-dashed px-4 py-6 text-center text-sm transition-colors',
        isDragActive && !isDragReject && 'border-primary bg-primary/5',
        isDragReject && 'border-destructive bg-destructive/5',
        !isDragActive && 'border-muted-foreground/30 hover:border-muted-foreground/60',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input {...getInputProps()} />
      <p className="text-muted-foreground">
        {isDragActive ? 'Drop files here' : 'Drag files here or click to upload'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground/60">Images and PDFs</p>
    </div>
  )
}
