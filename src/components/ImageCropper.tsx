import { useEffect, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { X } from 'lucide-react';
export default function ImageCropper({
  file,
  onSave,
  onClose,
}: {
  file: File;
  onSave: (blob: Blob) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(''),
    [crop, setCrop] = useState({ x: 0, y: 0 }),
    [zoom, setZoom] = useState(1),
    [area, setArea] = useState<Area | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const save = async () => {
    if (!area) return;
    setBusy(true);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;
      canvas
        .getContext('2d')!
        .drawImage(img, area.x, area.y, area.width, area.height, 0, 0, 1200, 800);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            onSave(blob);
            onClose();
          } else setError('画像を変換できませんでした');
          setBusy(false);
        },
        'image/jpeg',
        0.88,
      );
    } catch {
      setError('画像を読み込めませんでした');
      setBusy(false);
    }
  };
  return (
    <dialog ref={dialog} className="crop-dialog" onCancel={onClose} aria-labelledby="crop-title">
      <div className="dialog-header">
        <h2 id="crop-title">イベント画像のトリミング</h2>
        <button className="icon-button" onClick={onClose} aria-label="閉じる">
          <X />
        </button>
      </div>
      <div className="crop-stage">
        {url && (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={3 / 2}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        )}
      </div>
      <label className="crop-zoom">
        拡大率
        <input
          aria-label="画像の拡大率"
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="button outline" onClick={onClose}>
          キャンセル
        </button>
        <button className="button dark" onClick={save} disabled={busy || !area}>
          {busy ? '処理中…' : 'この範囲で使用する'}
        </button>
      </div>
    </dialog>
  );
}
