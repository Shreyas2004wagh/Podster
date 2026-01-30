import { useEffect, useRef, useState, useCallback } from "react";
import { SignalingClient } from "./signalingClient";

interface UseWebRTCOptions {
    sessionId: string;
    token: string | null;
    stream: MediaStream | null;
}

export interface RemoteParticipant {
    id: string; // Socket ID
    stream: MediaStream;
}

const STUN_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
    ]
};

export function useWebRTC({ sessionId, token, stream }: UseWebRTCOptions) {
    const signaling = useRef<SignalingClient | null>(null);
    const peers = useRef<Map<string, RTCPeerConnection>>(new Map());
    const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);

    const addRemoteStream = useCallback((id: string, stream: MediaStream) => {
        setRemoteParticipants((prev) => {
            if (prev.find((p) => p.id === id)) return prev;
            return [...prev, { id, stream }];
        });
    }, []);

    const removeParticipant = useCallback((id: string) => {
        setRemoteParticipants((prev) => prev.filter((p) => p.id !== id));
        const pc = peers.current.get(id);
        if (pc) {
            pc.close();
            peers.current.delete(id);
        }
    }, []);

    const createPeerConnection = useCallback((targetId: string, initiator: boolean) => {
        if (peers.current.has(targetId)) return peers.current.get(targetId)!;

        console.log(`Creating PeerConnection for ${targetId} (initiator: ${initiator})`);
        const pc = new RTCPeerConnection(STUN_SERVERS);
        peers.current.set(targetId, pc);

        // Add local tracks
        if (stream) {
            stream.getTracks().forEach((track) => {
                pc.addTrack(track, stream);
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
            console.log(`Received remote track from ${targetId}`, event.streams[0]);
            addRemoteStream(targetId, event.streams[0]);
        };

        pc.onconnectionstatechange = () => {
            console.log(`PC ${targetId} state: ${pc.connectionState}`);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                removeParticipant(targetId);
            }
        };

        // Negotiation needed (only for initiator to avoid glare/loops)
        if (initiator) {
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    signaling.current?.sendOffer(targetId, offer);
                } catch (err) {
                    console.error("Negotiation failed", err);
                }
            };
        }

        return pc;
    }, [stream, addRemoteStream, removeParticipant]);

    const handleOffer = useCallback(async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
        const pc = createPeerConnection(data.from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Add pending inputs if needed? (Already added in createPeerConnection if stream exists)

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signaling.current?.sendAnswer(data.from, answer);
    }, [createPeerConnection]);

    const handleAnswer = useCallback(async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
        const pc = peers.current.get(data.from);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }, []);

    const handleCandidate = useCallback(async (data: { from: string; candidate: RTCIceCandidateInit }) => {
        const pc = peers.current.get(data.from);
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }, []);

    const handleUserJoined = useCallback((data: { socketId: string }) => {
        console.log("User joined:", data.socketId);
        // As the host, I'm already here. The new guy (Guest) joined.
        // Or if I'm guest, and Host joins? 
        // Logic: If someone joins, I (existing peer) should initiate connection?
        // Let's say existing peers initiate offers to the new peer.
        createPeerConnection(data.socketId, true);
    }, [createPeerConnection]);

    useEffect(() => {
        if (!sessionId || !token) return;

        const client = new SignalingClient({ sessionId, token });
        signaling.current = client;

        client.on("connect", () => console.log("WebRTC: connected to signaling"));
        client.on("user-joined", handleUserJoined);
        client.on("offer", handleOffer);
        client.on("answer", handleAnswer);
        client.on("ice-candidate", handleCandidate);

        client.connect();

        return () => {
            client.disconnect();
            peers.current.forEach((pc) => pc.close());
            peers.current.clear();
        };
    }, [sessionId, token, handleUserJoined, handleOffer, handleAnswer, handleCandidate]);

    // Update tracks if stream changes
    useEffect(() => {
        if (!stream) return;
        // Track replacement logic to be implemented
    }, [stream]);

    return { remoteParticipants };
}
