import { useCallback } from 'react';
import { toast } from 'react-toastify';

export function useFileUpload(onUploadComplete: () => void) {
  // TODO: add some file validation
  const handleFileUpload = useCallback(
    (filesList: FileList) => {
      if (!filesList.length) return;
      const file = filesList[0];
      (async () => {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const response = await fetch('/api/conversation/upload-file', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();
          if (!data.success) {
            toast.error(`Failed to process file "${file.name}".`);
          }
        } catch {
          toast.error(`File upload failed for "${file.name}".`);
        } finally {
          onUploadComplete();
        }
      })();
    },
    [onUploadComplete]
  );

  return { handleFileUpload };
}
