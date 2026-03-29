import { useEffect, useRef, useState, useCallback } from "react";
import { SignalingClient } from "./signalingClient";

interface UseWebRTCOptions {
    sessionId: string;
    stream: MediaStream | null;
}

export interface RemoteParticipant {
    id: string; // Socket ID
    name: string;
    role: "host" | "guest";
    stream: MediaStream;
}

type ParticipantMeta = {
    name: string;
    role: "host" | "guest";
};

const STUN_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
    ]
};

export function useWebRTC({ sessionId, stream }: UseWebRTCOptions) {
    const signaling = useRef<SignalingClient | null>(null);
    const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
    const participantMeta = useRef<Map<string, ParticipantMeta>>(new Map());
    const streamRef = useRef<MediaStream | null>(stream);
    const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

    const rememberParticipant = useCallback((id: string, meta?: Partial<ParticipantMeta> | null) => {
        if (!meta) return;

        const current = participantMeta.current.get(id);
        const next: ParticipantMeta = {
            name: meta.name?.trim() || current?.name || `Guest (${id.slice(0, 4)})`,
            role: meta.role ?? current?.role ?? "guest"
        };
        participantMeta.current.set(id, next);
    }, []);

    const getParticipantMeta = useCallback((id: string): ParticipantMeta => {
        return participantMeta.current.get(id) ?? {
            name: `Guest (${id.slice(0, 4)})`,
            role: "guest"
        };
    }, []);

    const addRemoteStream = useCallback((id: string, stream: MediaStream) => {
        const meta = getParticipantMeta(id);
        setRemoteParticipants((prev) => {
            const existing = prev.find((p) => p.id === id);
            if (existing) {
                if (existing.stream === stream) return prev;
                return prev.map((participant) =>
                    participant.id === id ? { ...participant, ...meta, stream } : participant
                );
            }
            return [...prev, { id, ...meta, stream }];
        });
    }, [getParticipantMeta]);

    const removeParticipant = useCallback((id: string) => {
        setRemoteParticipants((prev) => prev.filter((p) => p.id !== id));
        participantMeta.current.delete(id);
        const pc = peers.current.get(id);
        if (pc) {
            pc.close();
            peers.current.delete(id);
        }
    }, []);

    const syncPeerConnectionTracks = useCallback(
        (pc: RTCPeerConnection, nextStream: MediaStream | null) => {
            const sendersByKind = new Map<string, RTCRtpSender>();
            pc.getSenders().forEach((sender) => {
                if (sender.track) {
                    sendersByKind.set(sender.track.kind, sender);
                }
            });

            if (!nextStream) {
                sendersByKind.forEach((sender) => {
                    void sender.replaceTrack(null).catch(() => undefined);
                });
                return;
            }

            nextStream.getTracks().forEach((track) => {
                const sender = sendersByKind.get(track.kind);
                if (sender) {
                    sendersByKind.delete(track.kind);
                    if (sender.track?.id !== track.id) {
                        void sender.replaceTrack(track).catch(() => undefined);
                    }
                    return;
                }

                pc.addTrack(track, nextStream);
            });

            sendersByKind.forEach((sender) => {
                void sender.replaceTrack(null).catch(() => undefined);
            });
        },
        []
    );

    const createPeerConnection = useCallback((targetId: string, initiator: boolean) => {
        if (peers.current.has(targetId)) return peers.current.get(targetId)!;

        const pc = new RTCPeerConnection(STUN_SERVERS);
        peers.current.set(targetId, pc);

        // Add local tracks
        const localStream = streamRef.current;
        if (localStream) {
            localStream.getTracks().forEach((track) => {
                pc.addTrack(track, localStream);
            });
        }

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                signaling.current?.sendIceCandidate(targetId, event.candidate);
            }
        };

        // Handle remote tracks
        pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            if (!remoteStream) return;
            addRemoteStream(targetId, remoteStream);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
                removeParticipant(targetId);
            }
        };

        pc.onnegotiationneeded = async () => {
            if (!initiator && !streamRef.current) {
                return;
            }

            if (pc.signalingState !== "stable") {
                return;
            }

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                signaling.current?.sendOffer(targetId, offer);
            } catch (err) {
                console.error("Negotiation failed", err);
            }
        };

        return pc;
    }, [addRemoteStream, removeParticipant]);

    const handleOffer = useCallback(async (data: {
        from: string;
        offer: RTCSessionDescriptionInit;
        user?: ParticipantMeta;
    }) => {
        rememberParticipant(data.from, data.user);
        const pc = createPeerConnection(data.from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Add pending inputs if needed? (Already added in createPeerConnection if stream exists)

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.current?.sendAnswer(data.from, answer);
    }, [createPeerConnection, rememberParticipant]);

    const handleAnswer = useCallback(async (data: {
        from: string;
        answer: RTCSessionDescriptionInit;
        user?: ParticipantMeta;
    }) => {
        rememberParticipant(data.from, data.user);
        const pc = peers.current.get(data.from);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }, [rememberParticipant]);

    const handleCandidate = useCallback(async (data: {
        from: string;
        candidate: RTCIceCandidateInit;
        user?: ParticipantMeta;
    }) => {
        rememberParticipant(data.from, data.user);
        const pc = peers.current.get(data.from);
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }, [rememberParticipant]);

    const handleUserJoined = useCallback((data: { socketId: string; user?: ParticipantMeta }) => {
        rememberParticipant(data.socketId, data.user);
        // As the host, I'm already here. The new guy (Guest) joined.
        // Or if I'm guest, and Host joins? 
        // Logic: If someone joins, I (existing peer) should initiate connection?
        // Let's say existing peers initiate offers to the new peer.
        createPeerConnection(data.socketId, true);
    }, [createPeerConnection, rememberParticipant]);

    const handleUserLeft = useCallback((data: { socketId: string }) => {
        removeParticipant(data.socketId);
    }, [removeParticipant]);

    useEffect(() => {
        if (!sessionId) return;

        const client = new SignalingClient({ sessionId });
        signaling.current = client;

        const handleConnect = () => console.log("WebRTC: connected to signaling");

        client.on("connect", handleConnect);
        client.on("user-joined", handleUserJoined);
        client.on("user-left", handleUserLeft);
        client.on("offer", handleOffer);
        client.on("answer", handleAnswer);
        client.on("ice-candidate", handleCandidate);

        client.connect();

        return () => {
            client.off("connect", handleConnect);
            client.off("user-joined", handleUserJoined);
            client.off("user-left", handleUserLeft);
            client.off("offer", handleOffer);
            client.off("answer", handleAnswer);
            client.off("ice-candidate", handleCandidate);
            client.disconnect();
            peers.current.forEach((pc) => pc.close());
            peers.current.clear();
            participantMeta.current.clear();
            setRemoteParticipants([]);
        };
    }, [sessionId, handleUserJoined, handleUserLeft, handleOffer, handleAnswer, handleCandidate]);

    useEffect(() => {
        streamRef.current = stream;
        peers.current.forEach((pc) => {
            syncPeerConnectionTracks(pc, stream);
        });
    }, [stream, syncPeerConnectionTracks]);

    return { remoteParticipants };
}
