export default function Dreamboard({ images }) {
  return (
    <div style={{ padding: 20 }}>
      <h3>🎨 Live Dreamboard</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {images.map((url, index) => (
          <img
            key={index}
            src={url}
            alt="AI Generated"
            style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: 10 }}
          />
        ))}
      </div>
    </div>
  );
}
