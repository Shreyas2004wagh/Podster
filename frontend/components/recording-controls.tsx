import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RecordingControlsProps {
  isRecording: boolean;
  isProcessing: boolean;
  isUploadActive: boolean;
  canStartRecording: boolean;
  startLabel: string;
  helperText?: string;
  durationLabel: string;
  onStart: () => void;
  onStop: () => void;
  onSave: () => void;
}

export function RecordingControls({
  isRecording,
  isProcessing,
  isUploadActive,
  canStartRecording,
  startLabel,
  helperText,
  durationLabel,
  onStart,
  onStop,
  onSave
}: RecordingControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-card">
      <Badge tone={isRecording ? "warning" : "default"}>
        {isRecording ? "Recording" : "Idle"}
      </Badge>
      <span className="text-sm text-slate-200">{durationLabel}</span>
      <div className="flex flex-1 items-center gap-2">
        <Button
          onClick={onStart}
          disabled={!canStartRecording || isRecording || isProcessing || isUploadActive}
          size="md"
        >
          {startLabel}
        </Button>
        <Button
          variant="secondary"
          onClick={onStop}
          disabled={!isRecording || isProcessing}
          size="md"
        >
          Stop
        </Button>
        <Button
          variant="ghost"
          onClick={onSave}
          disabled={isRecording || isProcessing || isUploadActive}
          size="md"
          >
          Upload chunks
        </Button>
      </div>
      {helperText && (
        <p className="w-full text-xs text-amber-200">{helperText}</p>
      )}
    </div>
  );
}
