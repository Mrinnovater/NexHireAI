
'use client';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Waveform({ isRecording }: { isRecording: boolean }) {
    const [bars, setBars] = useState<number[]>(new Array(20).fill(10));

    useEffect(() => {
        if (!isRecording) {
            setBars(new Array(20).fill(10));
            return;
        }

        const interval = setInterval(() => {
            setBars(prev => prev.map(() => Math.floor(Math.random() * 40) + 10));
        }, 100);

        return () => clearInterval(interval);
    }, [isRecording]);

    return (
        <div className="flex items-center justify-center gap-1 h-16">
            {bars.map((height, i) => (
                <motion.div
                    key={i}
                    animate={{ height: isRecording ? height : 4 }}
                    className="w-1 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                />
            ))}
        </div>
    );
}
