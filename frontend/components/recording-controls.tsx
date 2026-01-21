import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RecordingControlsProps {
  isRecording: boolean;
  isProcessing: boolean;
  durationLabel: string;
  onStart: () => void;
  onStop: () => void;
  onSave: () => void;
}

export function RecordingControls({
  isRecording,
  isProcessing,
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
        <Button onClick={onStart} disabled={isRecording || isProcessing} size="md">
          Start local recording
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
          disabled={isRecording || isProcessing}
          size="md"
        >
          Upload chunks
        </Button>
      </div>
    </div>
  );
}
