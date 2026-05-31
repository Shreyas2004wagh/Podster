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

function getSignalingConnectErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return "Failed to connect to live session signaling.";
}

function getSignalingDisconnectMessage(reason: string) {
    switch (reason) {
        case "io server disconnect":
            return "Live session signaling was closed by the server.";
        case "transport close":
        case "transport error":
        case "ping timeout":
            return "Live session signaling was interrupted. Reconnecting...";
        default:
            return reason === "io client disconnect"
                ? null
                : "Live session signaling disconnected.";
    }
}

export function useWebRTC({ sessionId, stream }: UseWebRTCOptions) {
    const signaling = useRef<SignalingClient | null>(null);
    const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
    const participantMeta = useRef<Map<string, ParticipantMeta>>(new Map());
    const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const disconnectTimers = useRef<Map<string, number>>(new Map());
    const streamRef = useRef<MediaStream | null>(stream);
    const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
    const [signalingError, setSignalingError] = useState<string | null>(null);

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
        const disconnectTimer = disconnectTimers.current.get(id);
        if (disconnectTimer) {
            window.clearTimeout(disconnectTimer);
            disconnectTimers.current.delete(id);
        }
        setRemoteParticipants((prev) => prev.filter((p) => p.id !== id));
        participantMeta.current.delete(id);
        pendingIceCandidates.current.delete(id);
        const pc = peers.current.get(id);
        if (pc) {
            pc.close();
            peers.current.delete(id);
        }
    }, []);

    const flushPendingIceCandidates = useCallback(async (id: string, pc: RTCPeerConnection) => {
        const queued = pendingIceCandidates.current.get(id);
        if (!queued?.length || !pc.remoteDescription) {
            return;
        }

        pendingIceCandidates.current.delete(id);
        for (const candidate of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
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
                signaling.current?.sendIceCandidate(targetId, event.candidate.toJSON());
            }
        };

        // Handle remote tracks
        pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            if (!remoteStream) return;
            addRemoteStream(targetId, remoteStream);
        };

        pc.onconnectionstatechange = () => {
            const disconnectTimer = disconnectTimers.current.get(targetId);
            if (disconnectTimer && pc.connectionState !== "disconnected") {
                window.clearTimeout(disconnectTimer);
                disconnectTimers.current.delete(targetId);
            }

            if (pc.connectionState === "disconnected") {
                if (!disconnectTimers.current.has(targetId)) {
                    const timer = window.setTimeout(() => {
                        disconnectTimers.current.delete(targetId);
                        if (pc.connectionState === "disconnected") {
                            removeParticipant(targetId);
                        }
                    }, 5_000);
                    disconnectTimers.current.set(targetId, timer);
                }
                return;
            }

            if (pc.connectionState === "failed" || pc.connectionState === "closed") {
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
        await flushPendingIceCandidates(data.from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.current?.sendAnswer(data.from, answer);
    }, [createPeerConnection, flushPendingIceCandidates, rememberParticipant]);

    const handleAnswer = useCallback(async (data: {
        from: string;
        answer: RTCSessionDescriptionInit;
        user?: ParticipantMeta;
    }) => {
        rememberParticipant(data.from, data.user);
        const pc = peers.current.get(data.from);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            await flushPendingIceCandidates(data.from, pc);
        }
    }, [flushPendingIceCandidates, rememberParticipant]);

    const handleCandidate = useCallback(async (data: {
        from: string;
        candidate: RTCIceCandidateInit;
        user?: ParticipantMeta;
    }) => {
        rememberParticipant(data.from, data.user);
        const pc = peers.current.get(data.from) ?? createPeerConnection(data.from, false);
        if (!pc.remoteDescription) {
            const queued = pendingIceCandidates.current.get(data.from) ?? [];
            queued.push(data.candidate);
            pendingIceCandidates.current.set(data.from, queued);
            return;
        }
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }, [createPeerConnection, rememberParticipant]);

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

    const handleRoomError = useCallback((data: { message: string }) => {
        setSignalingError(data.message);
    }, []);

    useEffect(() => {
        if (!sessionId) return;

        setSignalingError(null);
        const client = new SignalingClient({ sessionId });
        signaling.current = client;
        const peerConnections = peers.current;
        const participantMetaById = participantMeta.current;
        const queuedIceCandidates = pendingIceCandidates.current;
        const pendingDisconnectTimers = disconnectTimers.current;

        const handleConnect = () => {
            setSignalingError(null);
        };
        const handleConnectError = (error: Error) => {
            setSignalingError(getSignalingConnectErrorMessage(error));
        };
        const handleDisconnect = (reason: string) => {
            const message = getSignalingDisconnectMessage(reason);
            if (message) {
                setSignalingError(message);
            }
        };

        client.on("connect", handleConnect);
        client.on("connect_error", handleConnectError);
        client.on("disconnect", handleDisconnect);
        client.on("user-joined", handleUserJoined);
        client.on("user-left", handleUserLeft);
        client.on("offer", handleOffer);
        client.on("answer", handleAnswer);
        client.on("ice-candidate", handleCandidate);
        client.on("room-error", handleRoomError);

        client.connect();

        return () => {
            client.off("connect", handleConnect);
            client.off("connect_error", handleConnectError);
            client.off("disconnect", handleDisconnect);
            client.off("user-joined", handleUserJoined);
            client.off("user-left", handleUserLeft);
            client.off("offer", handleOffer);
            client.off("answer", handleAnswer);
            client.off("ice-candidate", handleCandidate);
            client.off("room-error", handleRoomError);
            client.disconnect();
            peerConnections.forEach((pc) => pc.close());
            peerConnections.clear();
            participantMetaById.clear();
            queuedIceCandidates.clear();
            pendingDisconnectTimers.forEach((timer) => window.clearTimeout(timer));
            pendingDisconnectTimers.clear();
            setRemoteParticipants([]);
        };
    }, [sessionId, handleUserJoined, handleUserLeft, handleOffer, handleAnswer, handleCandidate, handleRoomError]);

    useEffect(() => {
        streamRef.current = stream;
        peers.current.forEach((pc) => {
            syncPeerConnectionTracks(pc, stream);
        });
    }, [stream, syncPeerConnectionTracks]);

    return { remoteParticipants, signalingError };
}
