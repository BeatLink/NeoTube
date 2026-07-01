import { useParams } from 'react-router-dom'

export default function Watch() {
  const { videoId } = useParams<{ videoId: string }>()

  return (
    <main>
      <p>Loading video: {videoId}</p>
    </main>
  )
}
