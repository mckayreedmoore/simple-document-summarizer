import { useState, useCallback } from 'react';
import type { RefObject } from 'react';

export function useDragAndDrop(
  onDropFiles: (files: FileList) => void,
  ref: RefObject<HTMLElement>
) {
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (e.target === ref.current) setDragActive(false);
    },
    [ref]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        onDropFiles(e.dataTransfer.files);
      }
    },
    [onDropFiles]
  );

  return { dragActive, setDragActive, handleDragOver, handleDragLeave, handleDrop };
}
