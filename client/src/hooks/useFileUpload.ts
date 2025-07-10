import { useCallback } from 'react';
import { toast } from 'react-toastify';

export interface HandleFileUploadParams {
  file: File; 
  endpoint: string;
  acceptedExtensions?: string[]; // e.g. ['.pdf', '.docx']
}

export function useFileUpload(onUploadComplete: () => void) {
  const handleFileUpload = useCallback(
    async ({ file, endpoint, acceptedExtensions }: HandleFileUploadParams) => {
      if (!file) return;
      // Cursory file checks
      const fileName = file.name || '';
      const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
      let isAccepted = true;
      if (acceptedExtensions && acceptedExtensions.length > 0) {
        isAccepted = acceptedExtensions.map(e => e.toLowerCase()).includes(ext);
        if (!isAccepted) {
          toast.error(`File extension not accepted. Allowed: ${acceptedExtensions.join(', ')}`);
          return;
        }
      }
      const formData = new FormData();
      formData.append('file', file);
      try {
        const response = await fetch(endpoint, {
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
    },
    [onUploadComplete]
  );

  return { handleFileUpload };
}
