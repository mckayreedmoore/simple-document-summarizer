import React from 'react';

interface DragDropAreaProps {
  dragActive: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  className?: string;
  children: React.ReactNode;
  forwardedRef: React.RefObject<HTMLDivElement>;
}

const DragDropArea: React.FC<DragDropAreaProps> = ({
  dragActive,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  className = '',
  children,
  forwardedRef,
}) => (
  <div
    ref={forwardedRef}
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
    className={className + (dragActive ? ' ring-4 ring-blue-400 ring-opacity-60' : '')}
  >
    {children}
  </div>
);

export default DragDropArea;
