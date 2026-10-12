// SPDX-License-Identifier: GPL-3.0-or-later
#include "../embedded/RealtimeSnapshot.hpp"
#include <cassert>
#include <memory>
#include <thread>
#include <vector>
#include <iostream>
struct Value {
    unsigned sequence;
    std::thread::id owner;
    Value(unsigned n): sequence(n), owner(std::this_thread::get_id()) {}
    ~Value() { assert(std::this_thread::get_id() == owner); }
};
int main() {
    RealtimeSnapshot<std::vector<std::shared_ptr<Value>>> state;
    std::atomic<bool> done{false};
    std::thread audio([&] {
        unsigned last = 0;
        while (!done.load()) {
            const auto& values = state.read();
            if (!values.empty()) {
                const auto n = values.front()->sequence;
                assert(n >= last); last = n;
                std::this_thread::yield();
                for (const auto& v : values) assert(v->sequence == n);
            }
        }
        assert(state.read().front()->sequence == 100000);
    });
    for (unsigned n = 1; n <= 100000; ++n) {
        std::vector<std::shared_ptr<Value>> values;
        for (unsigned i = 0; i < n % 8 + 1; ++i) values.push_back(std::make_shared<Value>(n));
        state.publish(std::move(values));
    }
    done.store(true); audio.join();
    std::cout << "PASS: coherent snapshots, latest value, reclamation on producer only\n";
}
