import type { OutputFormat } from '../types';

export interface ToolContent {
  slug: string;
  format: OutputFormat;
  title: string;        // <title> / H1
  description: string;  // meta description
  intro: string;        // ~120 words above the tool
  body: string[];       // paragraphs of how-to / why (renders below the tool)
  faq: { q: string; a: string }[];
}

export const TOOLS: Record<string, ToolContent> = {
  'heic-to-jpg': {
    slug: 'heic-to-jpg',
    format: 'jpg',
    title: 'HEIC to JPG Converter — Free, Private, In Your Browser',
    description: 'Convert HEIC photos from your iPhone to JPG instantly. 100% free, no upload — your images never leave your device.',
    intro: 'HEIC is the photo format iPhones use by default, but Windows, older Android phones, and many websites cannot open it. This free converter turns HEIC into universally supported JPG right inside your browser — your photos are never uploaded to a server.',
    body: [
      'To convert, drag your .HEIC files into the box above (or tap to choose them). Each file is decoded and re-saved as a JPG on your own device, then offered for download. You can convert many photos at once and download them together as a zip.',
      'Because everything runs locally using WebAssembly, the tool works even offline once loaded, and none of your photos are ever sent anywhere. That makes it safe for personal and sensitive images.',
      'JPG is the best choice when you want maximum compatibility and small file sizes for sharing or uploading. If you need lossless quality or transparency, use the HEIC to PNG converter instead; for documents, use HEIC to PDF.',
    ],
    faq: [
      { q: 'Are my photos uploaded anywhere?', a: 'No. Conversion happens entirely in your browser using WebAssembly. Your files never leave your device.' },
      { q: 'Why won\'t my HEIC files open on Windows?', a: 'HEIC is an Apple-preferred format. Many Windows and Android apps lack a HEIC decoder, so converting to JPG makes the photos open everywhere.' },
      { q: 'Is there a limit on how many files I can convert?', a: 'You can convert many at once. Very large images (over 50 MB each) may be skipped to avoid running out of memory in the browser.' },
    ],
  },
  'heic-to-png': {
    slug: 'heic-to-png',
    format: 'png',
    title: 'HEIC to PNG Converter — Free, Private, In Your Browser',
    description: 'Convert iPhone HEIC photos to lossless PNG instantly. Free, no upload — files stay on your device.',
    intro: 'Convert HEIC images to PNG, a lossless format with wide support and transparency. Everything runs in your browser, so your photos are never uploaded.',
    body: [
      'Drag your .HEIC files into the box above to convert them to PNG on your own device, then download them individually or together as a zip.',
      'PNG preserves full image quality without compression artifacts, which is useful for editing or graphics. For smaller files better suited to sharing, convert to JPG instead.',
      'All processing happens locally with WebAssembly — no server, no upload, works offline once loaded.',
    ],
    faq: [
      { q: 'Does PNG keep full quality?', a: 'Yes. PNG is lossless, so the converted image keeps the full quality decoded from the HEIC.' },
      { q: 'Are my files uploaded?', a: 'No. Conversion runs entirely in your browser; your files never leave your device.' },
      { q: 'PNG or JPG — which should I pick?', a: 'Choose PNG for lossless quality or transparency; choose JPG for smaller files and easier sharing.' },
    ],
  },
  'heic-to-pdf': {
    slug: 'heic-to-pdf',
    format: 'pdf',
    title: 'HEIC to PDF Converter — Free, Private, In Your Browser',
    description: 'Turn iPhone HEIC photos into PDF documents instantly. Free, no upload — your images stay on your device.',
    intro: 'Convert HEIC photos into PDF documents, one page per image, entirely in your browser. Nothing is uploaded.',
    body: [
      'Drag your .HEIC files into the box above. Each photo becomes a single-page PDF on your device, ready to download or bundle together as a zip.',
      'PDF is ideal when you need to print, email, or submit a photo as a document. The image is embedded at full resolution.',
      'Processing is fully local using WebAssembly, so your images are never sent to a server and the tool works offline once loaded.',
    ],
    faq: [
      { q: 'Does each photo become its own PDF?', a: 'Yes. Each HEIC image is converted into its own single-page PDF; convert several and download them together as a zip.' },
      { q: 'Are my files uploaded?', a: 'No. Everything runs in your browser; your files never leave your device.' },
      { q: 'Will the PDF keep full image quality?', a: 'Yes. The photo is embedded into the PDF at its decoded resolution.' },
    ],
  },
};
