// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <array>
#include <atomic>
#include <utility>

// Single producer / single consumer. Each exclusively owns one slot; the third
// is exchanged atomically. Only the producer assigns (and destroys) payloads.
// Stop the consumer before destroying this object. T is immutable to the reader.
template<class T> class RealtimeSnapshot {
    static constexpr unsigned dirty = 4;
    std::array<T, 3> slots{};
    std::atomic<unsigned> middle{1};
    unsigned back = 2;   // producer only
    unsigned front = 0;  // consumer only
public:
    static_assert(ATOMIC_INT_LOCK_FREE == 2,
                  "Audio snapshot exchange must be lock-free");
    void publish(T value) {
        slots[back] = std::move(value);
        back = middle.exchange(back | dirty, std::memory_order_acq_rel) & 3;
    }
    const T& read() {
        if (middle.load(std::memory_order_acquire) & dirty)
            front = middle.exchange(front, std::memory_order_acq_rel) & 3;
        return slots[front];
    }
};
