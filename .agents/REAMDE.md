# 🎧 KNA – Audio Intelligence

## Overview
KNA is a sound analysis tool that transforms audio into **color heatmaps**.  
When a user uploads an audio file, KNA buffers the sound, slices it into chunks, and maps each slice to a color representation. 
The resulting heatmap reflects the **emotional vibe** of the audio through color theory.

## Purpose
- Provide creators and marketing teams with a **visual mood representation** of sound.
- Enable expressive storytelling by linking audio energy to **psychological color palettes**.
- Serve as a foundation for creative AI integrations in media, branding, and content design.

## Workflow
1. **Upload**: User provides an audio file via the web interface.
2. **Buffering**: The audio is read into memory using JavaScript’s Web Audio API.
3. **Chunking**: Audio is divided into slices (1second audio slices).
4. **Color Mapping**: Each chunk is hashed and mapped to a color (`#RRGGBB`).
5. **Heatmap Generation**: Colors are assembled into a timeline heatmap.
6. **Psychology Layer**: Colors are interpreted through **color psychology** (e.g., blue = calm, red = energetic).

## Technical Notes
- Written in **JavaScript** (browser-based).
- Uses **AudioBuffer** and **AnalyserNode** for frequency analysis.
- Hashing and mapping functions ensure consistent color output per chunk.
- Designed for **non-technical users** (creators, marketers) with a simple upload → visualize workflow.

## Output
- **Dominant Color**: The strongest vibe detected in the audio.
- **Least Present Color**: Highlights subtle emotional undertones.
- **Heatmap Visualization**: A timeline of color moods across the audio file.

## Use Cases
- 🎶 Music visualization
- 🎙️ Podcast mood tracking
- 📹 Video editing & branding
- 📊 Marketing content analysis

---

> KNA bridges **sound and psychology** by turning audio into color-driven insights.
