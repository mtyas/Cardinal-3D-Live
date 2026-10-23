"""Exact UI-only overlay for the pinned MindMeld meter widgets. DSP is untouched."""
INCLUDE = '#include "rack.hpp"'
BASE = 'struct VuMeterBase : OpaqueWidget {'
METHOD = '''
    cardinal3d::MeterFrame readMeter() override {
        cardinal3d::MeterFrame frame;
        if (!srcLevels) return frame;
        const auto engineFrame = APP->engine->getFrame();
        if (engineFrame != lastMeterFrame) { processPeakHold(); lastMeterFrame = engineFrame; }
        setColor();
        const float reference = isMasterTypeSrc && *isMasterTypeSrc ? 20.f : 10.f;
        for (int i = 0; i < 4; ++i)
            frame.levels[i] = std::min(1.f, std::cbrt(std::max(0.f, srcLevels[i]) / reference));
        for (int i = 0; i < 2; ++i)
            frame.levels[i + 4] = std::min(1.f, std::cbrt(std::max(0.f, peakHold[i]) / reference));
        const bool ghost = srcMuteGhost && *srcMuteGhost == 0.f;
        const auto peak = ghost ? VU_GRAY_TOP[0] : VU_THEMES_TOP[colorTheme][0];
        const auto rms = ghost ? VU_GRAY_TOP[1] : VU_THEMES_TOP[colorTheme][1];
        frame.peak = {peak.r, peak.g, peak.b}; frame.rms = {rms.r, rms.g, rms.b};
        frame.gap = gapX / (2.f * barX + gapX); frame.red = redThreshold / barY;
        return frame;
    }
'''

def patch_mixer_meter(source):
    if 'cardinal3d::MeterFrame readMeter()' in source:
        start = source.index('\n    cardinal3d::MeterFrame readMeter()')
        end = source.index('\n    }\n', start) + len('\n    }\n')
        return source[:start] + METHOD + source[end:]
    for token in (INCLUDE, BASE, 'float *srcLevels;'):
        if source.count(token) != 1:
            raise RuntimeError('Unexpected pinned MixMaster meter UI: '+token)
    return source.replace(INCLUDE, INCLUDE+'\n#include "../../../../src/cardinal3d/MeterTelemetry.hpp"').replace(BASE, BASE.replace('OpaqueWidget {','OpaqueWidget, cardinal3d::MeterTelemetry {')+METHOD).replace('float *srcLevels;', 'float *srcLevels = nullptr;')
