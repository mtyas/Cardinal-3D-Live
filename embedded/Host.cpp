// SPDX-License-Identifier: GPL-3.0-or-later
// Reuse upstream DPF's plugin lifecycle and Cardinal DSP without a UI or TCP.
#include "Host.h"
#include "src/DistrhoPlugin.cpp"
// Use the portable Windows resource-directory convention. No standalone entry
// point or audio-device backend is linked into this DLL.
#define DISTRHO_PLUGIN_TARGET_JACK
#define DISTRHO_IS_STANDALONE 0
#include "src/DistrhoUtils.cpp"
#undef DISTRHO_PLUGIN_TARGET_JACK
// Godot owns device routing; do not expose JACK-only controls in native menus.
namespace CardinalDISTRHO {
bool isUsingNativeAudio() noexcept { return false; }
bool supportsAudioInput() { return false; }
bool supportsBufferSizeChanges() { return false; }
bool supportsMIDI() { return false; }
bool isAudioInputEnabled() { return false; }
bool isMIDIEnabled() { return false; }
unsigned int getBufferSize() { return 0; }
bool requestAudioInput() { return false; }
bool requestBufferSizeChange(unsigned int) { return false; }
bool requestMIDI() { return false; }
}
#include "CardinalPluginContext.hpp"
#include <patch.hpp>
#include <asset.hpp>
#include <settings.hpp>
#include <system.hpp>
#include <jansson.h>
#include <cmath>
#include <memory>
#include <string>
#include <thread>
#include <mutex>
#include <vector>
#include <atomic>
#include <array>
#include "cardinal3d/Cardinal3DBridge.hpp"
#include "ShowModules.hpp"
#include "RealtimeSnapshot.hpp"
#define NANOSVGRAST_IMPLEMENTATION
#include <nanosvgrast.h>

// RemoteWindow has no physical cursor. Pointer modifiers will be carried by the
// embedded input adapter when live VR input is introduced.
#ifdef HEADLESS
namespace rack { namespace window { void WindowSetMods(Window*, int) {} } }
#else
#include <windows.h>
namespace rack { namespace window { void WindowRunEmbedded(Window*, void (*)(void*), void*); } }
#endif

namespace {
using namespace CardinalDISTRHO;
struct Host {
    std::string bundle, error, patch;
    std::thread::id owner = std::this_thread::get_id();
    uint32_t block;
    std::vector<float> silence;
    std::vector<uint8_t> panel;
    std::vector<uint8_t> surface;
    std::string surface_header;
    std::string show_state;
    std::vector<uint8_t> show_audio;
    std::mutex show_mutex;
    std::vector<std::pair<uint64_t, std::shared_ptr<cardinal3d::show::AudioRing>>> show_sources;
    RealtimeSnapshot<std::vector<std::shared_ptr<cardinal3d::show::MonitorSource>>> monitor_sources;
    std::vector<cardinal3d::show::MonitorSource*> monitor_identity;
    std::atomic<bool> monitor_enabled{false};
    float monitor_limiter_gain=1.f;
    std::atomic<uint32_t> monitor_rate{48000};
    std::array<std::atomic<float>,6> listener{};
    uint32_t show_rate = 48000;
    uint32_t surface_width = 0, surface_height = 0;
    std::unique_ptr<PluginExporter> plugin;
    std::unique_ptr<cardinal3d::Bridge> bridge;
    CardinalPluginContext* context = nullptr;
    std::atomic_flag busy = ATOMIC_FLAG_INIT;
    std::atomic_flag audio_busy = ATOMIC_FLAG_INIT;
    static constexpr uint32_t midi_capacity = 1024;
    std::array<MidiEvent, midi_capacity> midi_queue{};
    std::array<MidiEvent, midi_capacity + 16> midi_block{};
    std::atomic<uint32_t> midi_write{0}, midi_read{0};
    std::atomic<bool> midi_reset{false};
    Host(const char* path, const char* user, double rate, uint32_t frames)
        : bundle(path), block(frames), silence(frames, 0.f) {
        rack::asset::userDir = user;
        rack::system::createDirectories(user);
        rack::settings::settingsPath = rack::system::join(user, "embedded-settings.json");
        d_nextBufferSize = frames;
        d_nextSampleRate = rate;
        d_nextBundlePath = bundle.c_str();
        plugin.reset(new PluginExporter(nullptr, nullptr, nullptr, nullptr));
        context = static_cast<CardinalBasePlugin*>(plugin->getInstancePointer())->context;
        cardinal3d::show::registerPlugin(bundle);
#ifndef HEADLESS
        // No desktop Window::step() resizes the scene in an embedded host.
        // Native menu layout and clipping still need a real virtual canvas.
        context->scene->box.size = rack::math::Vec(1440, 900);
        context->window->pixelRatio = 1.f;
#endif
        bridge.reset(new cardinal3d::Bridge(true));
#ifndef HEADLESS
        bridge->setLocalSurfaceCallback([this](json_t* header, const std::vector<uint8_t>& pixels) {
            surface_header = cardinal3d::encode(header); surface = pixels;
            surface_width = json_integer_value(json_object_get(header, "width"));
            surface_height = json_integer_value(json_object_get(header, "height"));
        });
#endif
        plugin->activate();
    }
    ~Host() {
#ifndef HEADLESS
        rack::contextSet(context);
        rack::window::WindowRunEmbedded(context->window, [](void* ptr) { static_cast<Host*>(ptr)->bridge->destroyGraphics(); }, this);
        rack::contextSet(nullptr);
#endif
        bridge.reset(); if (plugin) plugin->deactivate();
    }
};
Host* live = nullptr;
std::string creation_error;
// DGL changes the thread's current GL context. Preserve Godot's context across
// every owner-thread call, including engine construction and destruction.
struct PreserveWglContext {
#ifndef HEADLESS
    HDC dc = wglGetCurrentDC(); HGLRC context = wglGetCurrentContext();
    ~PreserveWglContext() { wglMakeCurrent(dc, context); }
#endif
};
struct Context {
    Context(Host* h) { rack::contextSet(h->context); }
    ~Context() { rack::contextSet(nullptr); }
};
Host* checked(void* ptr) { return ptr && ptr == live ? live : nullptr; }
bool owner(Host* h) {
    if (h->owner == std::this_thread::get_id()) return true;
    h->error = "Patch operations require the host owner thread";
    return false;
}
template<class F> int operation(void* ptr, F fn) {
    Host* h = checked(ptr);
    if (!h || !owner(h)) return 0;
    if (h->busy.test_and_set(std::memory_order_acquire)) { h->error = "Audio callback is busy; retry on the next frame"; return 0; }
    struct Unlock { Host* h; ~Unlock() { h->busy.clear(std::memory_order_release); } } unlock{h};
    try { PreserveWglContext graphics; Context scope(h); fn(h); h->error.clear(); return 1; }
    catch (const std::exception& e) { h->error = e.what(); }
    catch (...) { h->error = "Unknown Cardinal host error"; }
    return 0;
}
}
void* c3d_create(const char* bundle, const char* user, double rate, uint32_t block) {
    if (live) { creation_error = "Only one embedded host is supported"; return nullptr; }
    if (!bundle || !*bundle || !user || !*user || !std::isfinite(rate) || rate < 8000 || rate > 384000 || !block || block > 16384) {
        creation_error = "Invalid resource path, sample rate or buffer size"; return nullptr;
    }
    try { PreserveWglContext graphics; live = new Host(bundle, user, rate, block); creation_error.clear(); return live; }
    catch (const std::exception& e) { creation_error = e.what(); }
    catch (...) { creation_error = "Unable to initialize Cardinal"; }
    return nullptr;
}
int c3d_destroy(void* ptr) {
    Host* h = checked(ptr);
    if (!h || !owner(h) || h->busy.test_and_set(std::memory_order_acquire)) return 0;
    c3d_device_close();
    PreserveWglContext graphics; delete h; live = nullptr; return 1;
}
const char* c3d_error(void* ptr) { Host* h = checked(ptr); return h ? h->error.c_str() : creation_error.c_str(); }
int c3d_load(void* ptr, const char* path) {
    if (!path || !*path) return 0;
    return operation(ptr, [path](Host* h) {
        if (!rack::system::isFile(path)) throw std::runtime_error("Patch file does not exist");
        h->context->patch->load(path);
    });
}
int c3d_save(void* ptr, const char* path) {
    if (!path || !*path) return 0;
    return operation(ptr, [path](Host* h) { h->context->patch->save(path); });
}
const char* c3d_patch_json(void* ptr) {
    if (!operation(ptr, [](Host* h) {
        json_t* root = h->context->patch->toJson();
        char* text = json_dumps(root, JSON_COMPACT | JSON_SORT_KEYS);
        json_decref(root);
        if (!text) throw std::runtime_error("Unable to serialize patch");
        h->patch = text;
        free(text);
    })) return nullptr;
    return live->patch.c_str();
}
const char* c3d_messages_json(void* ptr, const char* command) {
    if (!operation(ptr, [command](Host* h) {
        h->patch = h->bridge->invokeLocal(command ? command : "");
    })) return nullptr;
    return live->patch.c_str();
}
const char* c3d_render_surface(void* ptr) {
    if (!operation(ptr, [](Host* h) {
        h->surface_header.clear();
#ifndef HEADLESS
        rack::window::WindowRunEmbedded(h->context->window, [](void* ptr) { static_cast<Host*>(ptr)->bridge->render(); }, h);
#endif
    })) return nullptr;
    return live->surface_header.c_str();
}
const uint8_t* c3d_surface_rgba(void* ptr, uint32_t* width, uint32_t* height) {
    Host* h = checked(ptr);
    if (!h || !owner(h) || !width || !height || h->surface_header.empty()) return nullptr;
    *width = h->surface_width; *height = h->surface_height;
    return h->surface.data();
}
int c3d_push_midi(void* ptr, const uint8_t* bytes, uint32_t size) {
    Host* h = checked(ptr);
    if (!h || !owner(h) || !bytes || !size || size > 3 || bytes[0] < 0x80) return 0;
    const uint8_t status = bytes[0];
    const uint32_t expected = status < 0xf0 ? ((status & 0xe0) == 0xc0 ? 2 : 3)
        : status >= 0xf8 || status == 0xf6 ? 1 : status == 0xf2 ? 3 : status == 0xf1 || status == 0xf3 ? 2 : 0;
    if (size != expected) return 0; // SysEx is not supported by this short-message queue.
    for (uint32_t i = 1; i < size; ++i) if (bytes[i] >= 0x80) return 0;
    const uint32_t write = h->midi_write.load(std::memory_order_relaxed);
    const uint32_t next = (write + 1) % Host::midi_capacity;
    if (next == h->midi_read.load(std::memory_order_acquire)) {
        h->midi_reset.store(true, std::memory_order_release); // Never leave notes stuck on overflow.
        h->error = "MIDI input queue overflow; notes will be released";
        return 0;
    }
    auto& event = h->midi_queue[write];
    event.frame = 0; event.size = size; event.dataExt = nullptr;
    std::copy(bytes, bytes + size, event.data);
    h->midi_write.store(next, std::memory_order_release);
    return 1;
}
int c3d_midi_panic(void* ptr) {
    Host* h = checked(ptr);
    if (!h || !owner(h)) return 0;
    h->midi_reset.store(true, std::memory_order_release);
    return 1;
}
const char* c3d_show_json(void* ptr) {
    if (!operation(ptr, [](Host* h) {
        using namespace cardinal3d;
        auto* root = json_object();
        real(root, "frame", double(APP->engine->getFrame()));
        real(root, "sample_rate", APP->engine->getSampleRate());
        auto* speakers = json_array(); auto* lights = json_array(); auto* objects = json_array(); auto* boards=json_array();
        std::vector<std::pair<uint64_t, std::shared_ptr<show::AudioRing>>> streams;
        std::vector<std::shared_ptr<show::MonitorSource>> monitors;
        for (auto* widget : APP->scene->rack->getModules()) {
            if (auto* m = dynamic_cast<show::Speaker*>(widget->module)) {
                streams.emplace_back(uint64_t(m->id), m->stream);monitors.push_back(m->monitor);
                auto* item = json_object(); cardinal3d::string(item, "id", std::to_string(m->id));
                json_object_set_new(item, "position", json_pack("[fff]", double(m->values[show::Speaker::X].load(std::memory_order_relaxed)), double(m->values[show::Speaker::Y].load(std::memory_order_relaxed)), double(m->values[show::Speaker::Z].load(std::memory_order_relaxed))));
                real(item, "yaw", m->values[show::Speaker::YAW].load(std::memory_order_relaxed));
                real(item, "cone", m->values[show::Speaker::CONE].load(std::memory_order_relaxed));
                real(item, "ref_distance", m->values[show::Speaker::DISTANCE].load(std::memory_order_relaxed));
                real(item, "rolloff", m->values[show::Speaker::ROLLOFF].load(std::memory_order_relaxed));
                real(item, "max_distance", m->values[show::Speaker::MAX_DISTANCE].load(std::memory_order_relaxed));
                json_object_set_new(item, "directional", json_boolean(m->values[show::Speaker::MODE].load(std::memory_order_relaxed) > .5f));
                json_object_set_new(item, "dropped_samples", json_integer(m->stream->dropped.load()));
                json_array_append_new(speakers, item);
            } else if (auto* m = dynamic_cast<show::Light*>(widget->module)) {
                auto* item = json_object(); cardinal3d::string(item, "id", std::to_string(m->id));
                auto* values = json_array();
                for (auto& value : m->values) json_array_append_new(values, json_real(value.load(std::memory_order_relaxed)));
                json_object_set_new(item, "values", values); json_array_append_new(lights, item);
            } else if(auto* m=dynamic_cast<show::ChatBoard*>(widget->module)) {
                auto* item=json_object();cardinal3d::string(item,"id",std::to_string(m->id));auto* values=json_array();
                for(auto& v:m->values)json_array_append_new(values,json_real(v.load(std::memory_order_relaxed)));
                json_object_set_new(item,"values",values);json_array_append_new(boards,item);
            } else if(auto* m=dynamic_cast<show::Visual*>(widget->module)) {
                auto* item=json_object();cardinal3d::string(item,"id",std::to_string(m->id));
                const char* kinds[]={"figure","fountain","particles","sculpture"};cardinal3d::string(item,"kind",kinds[m->kind]);
                auto* values=json_array();for(auto& v:m->values)json_array_append_new(values,json_real(v.load(std::memory_order_relaxed)));
                json_object_set_new(item,"values",values);real(item,"phase",m->phase.load(std::memory_order_relaxed));real(item,"frequency",m->frequency.load(std::memory_order_relaxed));json_array_append_new(objects,item);
            }
        }
        json_object_set_new(root, "speakers", speakers); json_object_set_new(root, "lights", lights);
        json_object_set_new(root,"objects",objects);json_object_set_new(root,"boards",boards);
        bool changed = monitors.size() != h->monitor_identity.size();
        for (size_t i = 0; !changed && i < monitors.size(); ++i)
            changed = monitors[i].get() != h->monitor_identity[i];
        if (changed) {
            h->monitor_identity.clear();
            for (const auto& source : monitors) h->monitor_identity.push_back(source.get());
            h->monitor_sources.publish(std::move(monitors));
        }
        h->show_state = encode(root); json_decref(root);
        std::lock_guard<std::mutex> guard(h->show_mutex);
        h->show_sources = std::move(streams); h->show_rate = uint32_t(APP->engine->getSampleRate());h->monitor_rate.store(h->show_rate,std::memory_order_relaxed);
    })) return nullptr;
    return live->show_state.c_str();
}
const uint8_t* c3d_show_audio_network(void* ptr, uint32_t* size) {
    if (!size) return nullptr;
    *size = 0;
    Host* h = checked(ptr); if (!h) return nullptr;
    std::lock_guard<std::mutex> guard(h->show_mutex);
    {
        h->show_audio.clear();
        const auto append = [h](const void* data, size_t size) {
            const uint8_t* bytes = static_cast<const uint8_t*>(data); h->show_audio.insert(h->show_audio.end(), bytes, bytes + size);
        };
        append("C3DA", 4); uint32_t sources = 0; append(&sources, 4);
        for (const auto& source : h->show_sources) {
            auto* m = source.second.get(); if (sources >= 32) break;
            uint32_t r = m->read.load(std::memory_order_relaxed), w = m->write.load(std::memory_order_acquire);
            uint32_t count = std::min<uint32_t>(w - r, 4096); if (!count) continue;
            const uint64_t frame = m->frames[r % m->capacity];
            for (uint32_t i = 1; i < count; ++i) if (m->frames[(r + i) % m->capacity] != frame + i) { count = i; break; }
            const uint64_t id = source.first; const uint32_t rate = h->show_rate;
            append(&id, 8); append(&frame, 8); append(&rate, 4); append(&count, 4);
            for (uint32_t i = 0; i < count; ++i) { const float value = m->audio[(r + i) % m->capacity]; append(&value, 4); }
            m->read.store(r + count, std::memory_order_release); ++sources;
        }
        memcpy(h->show_audio.data() + 4, &sources, 4);
        if (!sources) h->show_audio.clear();
    }
    *size = uint32_t(live->show_audio.size()); return *size ? live->show_audio.data() : nullptr;
}
const uint8_t* c3d_show_audio(void* ptr, uint32_t* size) {
    if (!c3d_show_json(ptr)) { if (size) *size = 0; return nullptr; }
    return c3d_show_audio_network(ptr, size);
}
const uint8_t* c3d_panel_rgba(void* ptr, const char* id, uint32_t* width, uint32_t* height) {
    if (!id || !width || !height) return nullptr;
    *width = *height = 0;
    if (!operation(ptr, [id, width, height](Host* h) {
        rack::app::SvgPanel* panel = nullptr;
        if (auto* module = h->bridge->findLocalModule(id)) {
            for (auto* child : module->children) {
                panel = dynamic_cast<rack::app::SvgPanel*>(child);
                if (panel && panel->svg && panel->svg->handle) break;
            }
        }
        if (!panel || !panel->svg || !panel->svg->handle) throw std::runtime_error("Module has no static SVG panel");
        NSVGimage* image = panel->svg->handle;
        if (image->width <= 0 || image->height <= 0) throw std::runtime_error("Invalid panel dimensions");
        const float scale = std::min(2.f, 4096.f / std::max(image->width, image->height));
        const uint32_t w = uint32_t(std::ceil(image->width * scale));
        const uint32_t y = uint32_t(std::ceil(image->height * scale));
        if (!w || !y || uint64_t(w) * y > 4 * 1024 * 1024) throw std::runtime_error("Panel exceeds image budget");
        h->panel.assign(size_t(w) * y * 4, 0);
        std::unique_ptr<NSVGrasterizer, decltype(&nsvgDeleteRasterizer)> raster(nsvgCreateRasterizer(), nsvgDeleteRasterizer);
        if (!raster) throw std::runtime_error("Cannot create panel rasterizer");
        nsvgRasterize(raster.get(), image, 0, 0, scale, h->panel.data(), w, y, w * 4);
        *width = w; *height = y;
    })) return nullptr;
    return live->panel.data();
}
int c3d_spatial_monitor(void* ptr,int enabled,float x,float y,float z,float rx,float ry,float rz){
 auto* h=checked(ptr);if(!h||!owner(h))return 0;
 const float pose[]={x,y,z,rx,ry,rz};for(float v:pose)if(!std::isfinite(v))return 0;
 const float norm=std::sqrt(rx*rx+ry*ry+rz*rz);if(norm<.01f)return 0;
 for(int i=0;i<6;++i)h->listener[i].store(i<3?pose[i]:pose[i]/norm,std::memory_order_relaxed);
 h->monitor_enabled.store(enabled!=0,std::memory_order_release);return 1;
}
int c3d_process(void* ptr, const float* in_l, const float* in_r, float* out_l, float* out_r, uint32_t frames) {
    Host* h = checked(ptr);
    if (!h || !out_l || !out_r || !frames || frames > h->block) return 0;
    // Upstream Cardinal/Rack deliberately supports an audio thread alongside
    // its UI thread. Engine::stepBlock and structural edits own the native
    // engine locks. Artwork, JSON and widget stepping must not silence audio.
    // Only prevent unsupported simultaneous DSP callbacks for this instance.
    if (h->audio_busy.test_and_set(std::memory_order_acquire)) return 0;
    const float* inputs[] = {in_l ? in_l : h->silence.data(), in_r ? in_r : h->silence.data()};
    float* outputs[] = {out_l, out_r};
    uint32_t count = 0;
    uint32_t read = h->midi_read.load(std::memory_order_relaxed);
    const uint32_t write = h->midi_write.load(std::memory_order_acquire);
    if (h->midi_reset.exchange(false, std::memory_order_acq_rel)) {
        read = write;
        for (uint32_t channel = 0; channel < 16; ++channel) {
            auto& event = h->midi_block[count++];
            event.frame = 0; event.size = 3; event.dataExt = nullptr;
            event.data[0] = 0xb0 | channel; event.data[1] = 123; event.data[2] = 0;
        }
    }
    while (read != write && count < h->midi_block.size()) {
        h->midi_block[count++] = h->midi_queue[read]; read = (read + 1) % Host::midi_capacity;
    }
    h->midi_read.store(read, std::memory_order_release);
    try { h->plugin->run(inputs, outputs, frames, count ? h->midi_block.data() : nullptr, count); }
    catch (...) {
        std::fill(out_l, out_l + frames, 0.f); std::fill(out_r, out_r + frames, 0.f);
        h->audio_busy.clear(std::memory_order_release); return 0;
    }
    const bool monitoring=h->monitor_enabled.load(std::memory_order_acquire);
    const auto& monitors=h->monitor_sources.read();
    if(monitoring){std::fill(out_l,out_l+frames,0.f);std::fill(out_r,out_r+frames,0.f);}
    for(const auto& source:monitors){
      auto& ring=source->ring;const uint32_t w=ring.write.load(std::memory_order_acquire),r=ring.read.load(std::memory_order_relaxed);
      if(monitoring){
        using S=cardinal3d::show::Speaker;auto& v=source->values;
        const float dx=v[S::X].load()-h->listener[0].load(),dy=v[S::Y].load()-h->listener[1].load(),dz=v[S::Z].load()-h->listener[2].load();
        const float distance=std::max(.001f,std::sqrt(dx*dx+dy*dy+dz*dz));
        const float pan=std::max(-1.f,std::min(1.f,(dx*h->listener[3].load()+dy*h->listener[4].load()+dz*h->listener[5].load())/distance));
        const float ref=std::max(.1f,v[S::DISTANCE].load()),max=std::max(ref,v[S::MAX_DISTANCE].load());
        float gain=ref/(ref+v[S::ROLLOFF].load()*(std::max(ref,std::min(max,distance))-ref));
        if(v[S::MODE].load()>.5f){const float yaw=v[S::YAW].load()*float(M_PI)/180.f;const float dot=std::max(-1.f,std::min(1.f,(-dx*std::sin(yaw)-dz*std::cos(yaw))/distance));const float angle=std::acos(dot)*180.f/float(M_PI),inner=v[S::CONE].load()*.5f,outer=std::min(180.f,inner+22.5f);gain*=angle<=inner?1.f:angle>=outer?.15f:1.f-.85f*(angle-inner)/std::max(.1f,outer-inner);}
        const float gl=gain*std::sqrt((1-pan)*.5f),gr=gain*std::sqrt((1+pan)*.5f);
        const float delay=std::min(254.f,std::abs(pan)*.00065f*h->monitor_rate.load(std::memory_order_relaxed));
        const uint32_t n=std::min(frames,w-r),start=w-n;
        for(uint32_t i=0;i<n;++i){const float sample=ring.audio[(start+i)%cardinal3d::show::AudioRing::capacity];source->delay[source->cursor%256]=sample;
          source->delaySamples+=.005f*(delay-source->delaySamples);
          const uint32_t integerDelay=uint32_t(source->delaySamples);const float fraction=source->delaySamples-integerDelay;
          const float delayed=source->delay[(source->cursor+256-integerDelay)%256]*(1-fraction)+source->delay[(source->cursor+255-integerDelay)%256]*fraction;
          source->filtered+=.25f*(delayed-source->filtered);const float far=(1-std::abs(pan))*sample+std::abs(pan)*source->filtered;
          source->leftGain+=.02f*(gl-source->leftGain);source->rightGain+=.02f*(gr-source->rightGain);
          out_l[frames-n+i]+=(pan>0?far:sample)*source->leftGain;out_r[frames-n+i]+=(pan<0?far:sample)*source->rightGain;source->cursor++;
        }
      }else{source->leftGain=source->rightGain=0;}
      ring.read.store(w,std::memory_order_release);
    }
    if(monitoring)for(uint32_t i=0;i<frames;++i){
      const float peak=std::max(std::abs(out_l[i]),std::abs(out_r[i]));const float target=peak>.98f?.98f/peak:1.f;
      h->monitor_limiter_gain=target<h->monitor_limiter_gain?target:h->monitor_limiter_gain+.001f*(target-h->monitor_limiter_gain);
      out_l[i]*=h->monitor_limiter_gain;out_r[i]*=h->monitor_limiter_gain;
    }else h->monitor_limiter_gain=1.f;
    h->audio_busy.clear(std::memory_order_release);
    return 1;
}
