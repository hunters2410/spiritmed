import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, AlertCircle, Play, FileText, ExternalLink, ShieldAlert, HeartPulse } from 'lucide-react';

interface SharedResourceViewerProps {
    resourceId: string;
}

export function SharedResourceViewer({ resourceId }: SharedResourceViewerProps) {
    const [loading, setLoading] = useState(true);
    const [resource, setResource] = useState<any>(null);
    const [branch, setBranch] = useState<any>(null);
    const [timeLeft, setTimeLeft] = useState<string>('');
    const [isExpired, setIsExpired] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        loadResourceAndBranch();
    }, [resourceId]);

    // Expiry Countdown Timer
    useEffect(() => {
        if (!resource || isExpired) return;

        const updateTimer = () => {
            const exp = new Date(resource.expires_at).getTime();
            const now = new Date().getTime();
            const diff = exp - now;

            if (diff <= 0) {
                setIsExpired(true);
                setTimeLeft('Expired');
            } else {
                const hrs = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);

                const hrsStr = hrs.toString().padStart(2, '0');
                const minsStr = mins.toString().padStart(2, '0');
                const secsStr = secs.toString().padStart(2, '0');

                setTimeLeft(`${hrsStr} hrs: ${minsStr} mins: ${secsStr} secs`);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [resource, isExpired]);

    async function loadResourceAndBranch() {
        setLoading(true);
        setErrorMsg(null);
        try {
            let resData: any = null;

            // 1. Try querying Supabase
            const { data, error } = await supabase
                .from('patient_resources')
                .select('*')
                .eq('id', resourceId)
                .maybeSingle();

            if (error) {
                // If table is missing, fall back to LocalStorage demo data
                if (error.code === '42P01') {
                    console.log('patient_resources table missing. Checking LocalStorage fallback...');
                    const localData = localStorage.getItem('mock_patient_resources');
                    if (localData) {
                        const parsed = JSON.parse(localData);
                        resData = parsed.find((r: any) => r.id === resourceId);
                    }
                } else {
                    throw error;
                }
            } else {
                resData = data;
            }

            if (!resData) {
                setErrorMsg('Shared clinical resource not found or invalid link.');
                setLoading(false);
                return;
            }

            setResource(resData);

            // Check expiry immediately
            if (new Date(resData.expires_at) < new Date()) {
                setIsExpired(true);
            }

            // 2. Fetch branch details for custom branding
            if (resData.branch_id) {
                const { data: brData } = await supabase
                    .from('branches')
                    .select('*')
                    .eq('id', resData.branch_id)
                    .maybeSingle();
                if (brData) setBranch(brData);
            }
        } catch (e: any) {
            console.error('Error fetching shared resource:', e);
            setErrorMsg(e.message || 'An unexpected error occurred while loading this resource.');
        } finally {
            setLoading(false);
        }
    }

    // Helper to extract YouTube video ID
    function getYoutubeId(url: string) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // Helper to extract Vimeo video ID
    function getVimeoId(url: string) {
        const match = url.match(/vimeo\.com\/(\d+)/);
        return match ? match[1] : null;
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500" />
                    <p className="text-gray-400 text-sm animate-pulse font-medium">Securing connection & fetching clinical file...</p>
                </div>
            </div>
        );
    }

    if (errorMsg) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="bg-gray-800/80 backdrop-blur-md rounded-2xl max-w-md w-full p-8 border border-red-500/30 text-center shadow-2xl">
                    <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                        <ShieldAlert className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Access Blocked</h1>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">{errorMsg}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-red-600/20"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    if (isExpired) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="bg-gray-800/60 backdrop-blur-lg rounded-3xl max-w-lg w-full p-10 border border-gray-700 text-center shadow-2xl">
                    <div className="mx-auto w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
                        <Clock className="w-10 h-10 text-amber-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">Resource Link Expired</h1>
                    <p className="text-gray-400 text-sm leading-relaxed mb-6">
                        For data safety and patient confidentiality, clinical documents are shared using strict, temporary secure link parameters. 
                        This specific resource link expired on <span className="font-semibold text-amber-400">{new Date(resource?.expires_at).toLocaleString()}</span> and is no longer accessible.
                    </p>
                    <div className="bg-gray-900/60 rounded-xl p-4 text-xs text-gray-500 border border-gray-800 text-left space-y-1 mb-8">
                        <p className="font-semibold text-gray-400">What should I do?</p>
                        <p>• Contact the medical practitioner or receptionist at the issuing branch.</p>
                        <p>• Request a new, temporary access token email link.</p>
                    </div>
                    {branch && (
                        <div className="border-t border-gray-700/50 pt-6 text-gray-400">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Clinic Branch Info</p>
                            <p className="text-sm font-bold text-white">{branch.name}</p>
                            {branch.phone && <p className="text-xs mt-0.5">📞 {branch.phone}</p>}
                            {branch.email && <p className="text-xs">✉️ {branch.email}</p>}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const ytId = resource.resource_type === 'video_link' ? getYoutubeId(resource.url) : null;
    const vimeoId = resource.resource_type === 'video_link' ? getVimeoId(resource.url) : null;

    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col">
            {/* Real-time Expiry Countdown Banner */}
            <div className="bg-indigo-600 text-center py-2.5 px-4 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md shrink-0 border-b border-indigo-500">
                <Clock className="w-4 h-4 animate-pulse" />
                <span>Secure Temporary Portal • Access Expires In: </span>
                <span className="font-mono text-yellow-300 ml-1.5 drop-shadow">{timeLeft}</span>
            </div>

            <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6 justify-center">
                {/* Branding Title */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20">
                            <HeartPulse className="w-6 h-6 text-teal-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-teal-400 uppercase tracking-wider">Clinical Shared Resource</h2>
                            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white mt-0.5">{resource.title}</h1>
                        </div>
                    </div>
                    {(branch?.logo_url || branch?.signature_url) && (
                        <img src={branch.logo_url || branch.signature_url} alt="Clinic Logo" className="h-10 object-contain rounded opacity-90" />
                    )}
                </div>

                {/* Resource Renderer */}
                <div className="bg-gray-900 rounded-3xl overflow-hidden border border-gray-800 shadow-2xl p-4 md:p-6 flex flex-col gap-4">
                    {/* 1. Video IFrame (YouTube) */}
                    {resource.resource_type === 'video_link' && ytId && (
                        <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-lg border border-gray-800">
                            <iframe
                                src={`https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`}
                                title={resource.title}
                                className="absolute inset-0 w-full h-full"
                                allowFullScreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            />
                        </div>
                    )}

                    {/* 2. Video IFrame (Vimeo) */}
                    {resource.resource_type === 'video_link' && vimeoId && (
                        <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-lg border border-gray-800">
                            <iframe
                                src={`https://player.vimeo.com/video/${vimeoId}`}
                                title={resource.title}
                                className="absolute inset-0 w-full h-full"
                                allowFullScreen
                            />
                        </div>
                    )}

                    {/* 3. Generic Video Link (HTML5 Video) */}
                    {resource.resource_type === 'video_link' && !ytId && !vimeoId && (
                        <div className="w-full rounded-2xl overflow-hidden shadow-lg border border-gray-800 bg-black">
                            <video
                                controls
                                src={resource.url}
                                className="w-full max-h-[500px]"
                                poster="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=60"
                            />
                        </div>
                    )}

                    {/* 4. PDF Document Frame */}
                    {resource.resource_type === 'pdf_file' && (
                        <div className="w-full h-[600px] rounded-2xl overflow-hidden border border-gray-800 shadow-inner bg-gray-950">
                            <object
                                data={resource.url}
                                type="application/pdf"
                                className="w-full h-full"
                            >
                                <iframe
                                    src={`https://docs.google.com/gview?url=${encodeURIComponent(resource.url)}&embedded=true`}
                                    className="w-full h-full border-none"
                                />
                            </object>
                        </div>
                    )}

                    {/* 5. Generic Other Resource / Attachment Link / Image File */}
                    {resource.resource_type === 'other' && (() => {
                        const isImage = resource.url?.startsWith('data:image/') || 
                                        resource.url?.match(/\.(jpeg|jpg|gif|png|webp|svg)/i) !== null;
                        if (isImage) {
                            return (
                                <div className="w-full flex items-center justify-center p-4 bg-gray-950/60 rounded-2xl border border-gray-800 overflow-hidden bg-black/40">
                                    <img
                                        src={resource.url}
                                        alt={resource.title}
                                        className="max-w-full max-h-[500px] object-contain rounded-xl shadow-2xl border border-gray-800"
                                    />
                                </div>
                            );
                        }
                        return (
                            <div className="p-8 text-center flex flex-col items-center gap-4 bg-gray-950/60 rounded-2xl border border-gray-800">
                                <div className="p-4 bg-indigo-500/10 rounded-full">
                                    <FileText className="w-12 h-12 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">Clinical Attachment</h3>
                                    <p className="text-xs text-gray-500 mt-1 max-w-sm">
                                        This document is shared as an external link. Please click below to safely open it in a secure new browser tab.
                                    </p>
                                </div>
                                <a
                                    href={resource.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition"
                                >
                                    Open Shared Document Link <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                        );
                    })()}

                    {/* Description Details */}
                    {resource.description && (
                        <div className="bg-gray-950/40 rounded-2xl p-4 border border-gray-800 mt-2">
                            <h3 className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Practitioner Note / Description</h3>
                            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{resource.description}</p>
                        </div>
                    )}
                </div>

                {/* Footer Section */}
                <footer className="mt-4 text-center text-xs text-gray-600 border-t border-gray-900 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                    {branch ? (
                        <div className="text-left space-y-0.5">
                            <p className="font-semibold text-gray-400">Shared by {branch.name}</p>
                            <p className="text-[10px]">{branch.address} • {branch.city}</p>
                        </div>
                    ) : (
                        <p className="font-semibold text-gray-400">Spiritmed EHR Clinical Service</p>
                    )}
                    <p className="text-[10px]">
                        🔒 Secure Clinical Portal. For medical safety, link is temporary and will completely decay upon expiration.
                    </p>
                </footer>
            </main>
        </div>
    );
}
