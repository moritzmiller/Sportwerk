"use client";

import { useEffect, useRef, useState } from "react";

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_ASPECT = TARGET_WIDTH / TARGET_HEIGHT;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function dataUrlBytes(dataUrl) {
    const base64 = dataUrl.split(",", 2)[1] || "";
    return Math.floor((base64.length * 3) / 4);
}

function getCropRect(image, zoom, focusX, focusY) {
    let width = image.naturalWidth;
    let height = width / TARGET_ASPECT;

    if (height > image.naturalHeight) {
        height = image.naturalHeight;
        width = height * TARGET_ASPECT;
    }

    width /= zoom;
    height /= zoom;

    const maxX = Math.max(0, image.naturalWidth - width);
    const maxY = Math.max(0, image.naturalHeight - height);
    const x = clamp((image.naturalWidth * focusX) - (width / 2), 0, maxX);
    const y = clamp((image.naturalHeight * focusY) - (height / 2), 0, maxY);

    return { x, y, width, height };
}

function drawCrop(canvas, image, zoom, focusX, focusY) {
    const context = canvas.getContext("2d");
    if (!context) return;

    const crop = getCropRect(image, zoom, focusX, focusY);
    canvas.width = TARGET_WIDTH;
    canvas.height = TARGET_HEIGHT;
    context.clearRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
    context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        TARGET_WIDTH,
        TARGET_HEIGHT
    );
}

function exportCroppedImage(canvas, maxBytes) {
    const qualities = [0.9, 0.84, 0.78, 0.72, 0.66, 0.6];

    for (const quality of qualities) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrlBytes(dataUrl) <= maxBytes) {
            return dataUrl;
        }
    }

    throw new Error("Der Zuschnitt ist noch zu gross. Bitte ein kleineres Bild verwenden.");
}

export default function ImageCropper({
    id,
    value,
    onChange,
    onError,
    maxOutputBytes = 1500 * 1024,
    required = false,
    clearOnReset = true,
}) {
    const imageRef = useRef(null);
    const canvasRef = useRef(null);
    const [sourceUrl, setSourceUrl] = useState("");
    const [fileName, setFileName] = useState("");
    const [imageReady, setImageReady] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [focusX, setFocusX] = useState(0.5);
    const [focusY, setFocusY] = useState(0.5);

    useEffect(() => {
        if (!imageReady || !imageRef.current || !canvasRef.current) return;
        drawCrop(canvasRef.current, imageRef.current, zoom, focusX, focusY);
    }, [imageReady, zoom, focusX, focusY]);

    function resetSelection() {
        setSourceUrl("");
        setFileName("");
        setImageReady(false);
        setZoom(1);
        setFocusX(0.5);
        setFocusY(0.5);
        if (clearOnReset) {
            onChange("", "");
        }
    }

    function handleFileChange(event) {
        const file = event.target.files?.[0];

        if (!file) {
            resetSelection();
            return;
        }

        if (!file.type.startsWith("image/")) {
            onError?.("Bitte nur Bilddateien hochladen.");
            event.target.value = "";
            return;
        }

        if (file.size > MAX_SOURCE_BYTES) {
            onError?.("Bitte ein Ausgangsbild bis maximal 8 MB hochladen.");
            event.target.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setSourceUrl(String(reader.result || ""));
            setFileName(file.name);
            setImageReady(false);
            setZoom(1);
            setFocusX(0.5);
            setFocusY(0.5);
        };
        reader.onerror = () => {
            onError?.("Bild konnte nicht geladen werden.");
            event.target.value = "";
        };
        reader.readAsDataURL(file);
    }

    function applyCrop() {
        if (!canvasRef.current || !imageReady) {
            onError?.("Bitte zuerst ein Bild auswaehlen.");
            return;
        }

        try {
            const dataUrl = exportCroppedImage(canvasRef.current, maxOutputBytes);
            onChange(dataUrl, fileName);
        } catch (error) {
            onError?.(error?.message || "Bild konnte nicht zugeschnitten werden.");
        }
    }

    return (
        <div className="image-cropper">
            <input
                id={id}
                name={id}
                type="file"
                className="input"
                accept="image/*"
                onChange={handleFileChange}
                required={required && !value}
            />

            {sourceUrl ? (
                <div className="image-cropper__panel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        ref={imageRef}
                        src={sourceUrl}
                        alt=""
                        className="image-cropper__source"
                        onLoad={() => setImageReady(true)}
                    />
                    <canvas
                        ref={canvasRef}
                        className="image-cropper__canvas"
                        aria-label="Titelbild-Zuschnitt 16 zu 9"
                    />

                    <div className="image-cropper__controls">
                        <label>
                            <span>Zoom</span>
                            <input
                                type="range"
                                min="1"
                                max="3"
                                step="0.05"
                                value={zoom}
                                onChange={(event) => setZoom(Number(event.target.value))}
                            />
                        </label>
                        <label>
                            <span>Horizontal</span>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={focusX}
                                onChange={(event) => setFocusX(Number(event.target.value))}
                            />
                        </label>
                        <label>
                            <span>Vertikal</span>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={focusY}
                                onChange={(event) => setFocusY(Number(event.target.value))}
                            />
                        </label>
                    </div>

                    <div className="image-cropper__actions">
                        <button type="button" className="btn btn-primary" onClick={applyCrop}>
                            Zuschnitt uebernehmen
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={resetSelection}>
                            Entfernen
                        </button>
                    </div>
                </div>
            ) : null}

            {value ? <p className="field-hint">Titelbild ist im festen 16:9-Format vorbereitet.</p> : null}
        </div>
    );
}
