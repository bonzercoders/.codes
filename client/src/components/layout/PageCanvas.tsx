interface PageCanvasProps {
  title: string
}

export function PageCanvas({ title }: PageCanvasProps) {
  return (
    <div className="page-canvas">
      <h1 className="page-canvas__title">{title}</h1>
    </div>
  )
}