import { useRef, useState } from 'preact/hooks';

interface Props {
  accept: string;
  onFiles: (files: File[]) => void;
  title?: string;
  subtitle?: string;
}

export default function Dropzone({
  accept,
  onFiles,
  title = 'Drag & drop your files',
  subtitle = 'Files are processed entirely on your device — never uploaded',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files) onFiles([...e.dataTransfer.files]);
  };

  return (
    <div
      class={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 mb-4
        ${dragging
          ? 'border-violet-400 bg-violet-500/10'
          : 'border-[--border-accent] bg-gradient-to-br from-violet-900/10 to-purple-900/5 hover:border-violet-400 hover:bg-violet-500/5'
        }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid="dropzone"
      onClick={() => inputRef.current?.click()}
    >
      <div class="w-12 h-12 mx-auto mb-4 bg-violet-500/20 rounded-xl flex items-center justify-center text-2xl">📷</div>
      <p class="text-slate-200 font-semibold text-sm mb-1">{title}</p>
      <p class="text-slate-500 text-xs mb-4">{subtitle}</p>
      <button
        type="button"
        class="bg-gradient-to-br from-violet-600 to-purple-600 text-white text-sm font-semibold px-5 py-2 rounded-lg btn-glow hover:from-violet-500 hover:to-purple-500 transition-all"
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
      >
        Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        class="sr-only"
        data-testid="file-input"
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          if (input.files) onFiles([...input.files]);
        }}
      />
    </div>
  );
}
