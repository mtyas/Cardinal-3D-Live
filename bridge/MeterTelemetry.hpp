// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <array>
#include <cstdint>
namespace cardinal3d {
// UI-only interface. No processing, locks or allocations are added to DSP.
struct MeterFrame {
    std::array<float, 6> levels{};
    std::array<float, 3> peak{}, rms{};
    float gap = .125f, red = .7937f;
};
struct MeterTelemetry {
    uint64_t lastMeterFrame = uint64_t(-1);
    virtual ~MeterTelemetry() = default;
    virtual MeterFrame readMeter() = 0;
};
}
