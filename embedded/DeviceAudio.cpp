// SPDX-License-Identifier: GPL-3.0-or-later
#include "Host.h"
#define __WINDOWS_WASAPI__
#define __WINDOWS_DS__
#define __WINDOWS_ASIO__
#include <windows.h>
#include <objbase.h>
#include "src/jackbridge/rtaudio/RtAudio.cpp"
#include <jansson.h>
#include <memory>
#include <atomic>
#include <array>

namespace {
struct DeviceStream {
    std::unique_ptr<RtAudio> driver;
    void* host = nullptr;
    unsigned block = 256, inputs = 0, outputs = 0, rate = 0, buffer = 0;
    int il = -1, ir = -1, ol = 0, oright = 1;
    std::array<float,16384> left{},right{},outleft{},outright{};
    std::atomic<unsigned> xruns{0}, callbacks{0}, null_inputs{0};
    std::atomic<float> gain{1.f}, input_peak{0.f}, input_left_peak{0.f}, input_right_peak{0.f};
    std::string error, result, input_name, output_name;
    static void hold(std::atomic<float>& value,float peak){float previous=value.load(std::memory_order_relaxed);while(peak>previous&&!value.compare_exchange_weak(previous,peak,std::memory_order_relaxed)){} }
    static int callback(void* output, void* input, unsigned frames, double, RtAudioStreamStatus flags, void* ptr) {
        auto* s = static_cast<DeviceStream*>(ptr);
        s->callbacks.fetch_add(1,std::memory_order_relaxed);if(s->inputs&&!input)s->null_inputs.fetch_add(1,std::memory_order_relaxed);
        if (flags) s->xruns.fetch_add(1,std::memory_order_relaxed);
        auto* in = static_cast<float*>(input); auto* out = static_cast<float*>(output);
        if (out) std::fill(out,out + size_t(frames)*s->outputs,0.f);
        float peak = 0.f,leftPeak=0.f,rightPeak=0.f;
        for (unsigned offset=0;offset<frames;offset+=s->block) {
            const unsigned n=std::min(s->block,frames-offset);
            for (unsigned i=0;i<n;i++) {
                s->left[i]=in && s->il>=0 ? in[size_t(s->il)*frames+offset+i] : 0.f;
                s->right[i]=in && s->ir>=0 ? in[size_t(s->ir)*frames+offset+i] : 0.f;
                leftPeak=std::max(leftPeak,std::abs(s->left[i]));rightPeak=std::max(rightPeak,std::abs(s->right[i]));
                peak=std::max(peak,std::max(std::abs(s->left[i]),std::abs(s->right[i])));
            }
            if (!c3d_process(s->host,s->left.data(),s->right.data(),s->outleft.data(),s->outright.data(),n)) continue;
            const float gain=s->gain.load(std::memory_order_relaxed);
            if (out) for (unsigned i=0;i<n;i++) {
                if(s->ol==s->oright) out[size_t(s->ol)*frames+offset+i]=(s->outleft[i]+s->outright[i])*.5f*gain;
                else { out[size_t(s->ol)*frames+offset+i]=s->outleft[i]*gain; out[size_t(s->oright)*frames+offset+i]=s->outright[i]*gain; }
            }
        }
        hold(s->input_peak,peak);hold(s->input_left_peak,leftPeak);hold(s->input_right_peak,rightPeak);
        return 0;
    }
    void stop() {
        if(driver) { if(driver->isStreamRunning()) driver->stopStream(); if(driver->isStreamOpen()) driver->closeStream(); }
        driver.reset();host=nullptr;
    }
} device;
std::string catalog;
std::string encode(json_t* value) { char* text=json_dumps(value,JSON_COMPACT);std::string result=text?text:"{}";free(text);json_decref(value);return result; }
}
extern "C" {
const char* c3d_device_catalog() {
    if(!catalog.empty())return catalog.c_str();
    auto* root=json_array();
    for(auto api:{RtAudio::WINDOWS_WASAPI,RtAudio::WINDOWS_ASIO,RtAudio::WINDOWS_DS}) {
        try {
            RtAudio probe(api);auto* group=json_object();
            json_object_set_new(group,"api",json_integer(api));json_object_set_new(group,"name",json_string(RtAudio::getApiDisplayName(api).c_str()));
            auto* devices=json_array();
            for(unsigned id=0;id<probe.getDeviceCount();id++) {
                const auto d=probe.getDeviceInfo(id);if(!d.probed)continue;
                auto* item=json_pack("{s:i,s:s,s:i,s:i,s:b,s:b}","id",id,"name",d.name.c_str(),"inputs",d.inputChannels,"outputs",d.outputChannels,"default_input",d.isDefaultInput,"default_output",d.isDefaultOutput);
                auto* rates=json_array();for(auto rate:d.sampleRates)json_array_append_new(rates,json_integer(rate));json_object_set_new(item,"rates",rates);json_object_set_new(item,"preferred_rate",json_integer(d.preferredSampleRate));json_array_append_new(devices,item);
            }
            json_object_set_new(group,"devices",devices);json_array_append_new(root,group);
        } catch(...) {}
    }
    catalog=encode(root);return catalog.c_str();
}
int c3d_device_open(void* host,const char* config,uint32_t block) {
    try {
        device.stop();device.error.clear();device.input_name="Off";device.output_name="";
        json_error_t error;std::unique_ptr<json_t,decltype(&json_decref)> j(json_loads(config,0,&error),json_decref);
        if(!j || !host || !block || block>16384)throw std::runtime_error("Invalid audio configuration");
        auto value=[&](const char* key){return int(json_integer_value(json_object_get(j.get(),key)));};
        auto api=static_cast<RtAudio::Api>(value("api"));
        if(api!=RtAudio::WINDOWS_WASAPI && api!=RtAudio::WINDOWS_DS && api!=RtAudio::WINDOWS_ASIO)throw std::runtime_error("Audio API is not compiled into this build");
        device.driver.reset(new RtAudio(api));
        RtAudio::StreamParameters in,out;
        out.deviceId=value("output_device");
        auto output=device.driver->getDeviceInfo(out.deviceId);device.output_name=output.name;
        device.ol=value("output_left");device.oright=value("output_right");
        if(device.ol<0 || device.oright<0 || unsigned(std::max(device.ol,device.oright))>=output.outputChannels)throw std::runtime_error("Output channel unavailable");
        out.nChannels=std::max(device.ol,device.oright)+1;device.outputs=out.nChannels;
        device.inputs=0;device.il=device.ir=-1;
        if(value("input_device")>=0) {
            in.deviceId=value("input_device");auto input=device.driver->getDeviceInfo(in.deviceId);device.input_name=input.name;
            if(api==RtAudio::WINDOWS_ASIO && in.deviceId!=out.deviceId)throw std::runtime_error("ASIO input and output must use the same interface");
            device.il=value("input_left");device.ir=value("input_right");
            if(device.il < -1 || device.ir < -1 || std::max(device.il,device.ir)<0 || unsigned(std::max(device.il,device.ir))>=input.inputChannels)throw std::runtime_error("Input channel unavailable");
            in.nChannels=std::max(device.il,device.ir)+1;device.inputs=in.nChannels;
        }
        device.rate=value("sample_rate");device.buffer=value("buffer_size");device.block=block;device.host=host;
        if(device.rate<8000 || device.rate>192000 || device.buffer<32 || device.buffer>16384)throw std::runtime_error("Unsupported sample rate or buffer request");
        RtAudio::StreamOptions options;options.flags=RTAUDIO_NONINTERLEAVED;options.numberOfBuffers=2;
        device.driver->openStream(&out,device.inputs?&in:nullptr,RTAUDIO_FLOAT32,device.rate,&device.buffer,DeviceStream::callback,&device,&options);
        device.rate=device.driver->getStreamSampleRate();device.xruns.store(0);device.callbacks.store(0);device.null_inputs.store(0);device.input_peak.store(0);device.input_left_peak.store(0);device.input_right_peak.store(0);device.driver->startStream();return 1;
    } catch(const std::exception& e) { device.error=e.what(); }
    catch(...) { device.error="Audio device could not be opened"; }
    try{device.stop();}catch(...){}return 0;
}
void c3d_device_close() { try{device.stop();}catch(...){} }
int c3d_device_control_panel() {
    return device.driver && device.driver->getCurrentApi()==RtAudio::WINDOWS_ASIO && device.driver->isStreamOpen() && ASIOControlPanel()==ASE_OK;
}
void c3d_device_gain(float gain) { device.gain.store(std::max(0.f,std::min(1.f,gain))); }
const char* c3d_device_status() {
    auto* status=json_pack("{s:b,s:i,s:i,s:i,s:f,s:s}","running",device.driver && device.driver->isStreamRunning(),"sample_rate",device.rate,"buffer_size",device.buffer,"xruns",device.xruns.load(),"input_peak",double(device.input_peak.exchange(0)),"error",device.error.c_str());
    json_object_set_new(status,"input_left_peak",json_real(device.input_left_peak.exchange(0)));json_object_set_new(status,"input_right_peak",json_real(device.input_right_peak.exchange(0)));
    json_object_set_new(status,"input_device",json_string(device.input_name.c_str()));json_object_set_new(status,"output_device",json_string(device.output_name.c_str()));
    json_object_set_new(status,"input_left",json_integer(device.il));json_object_set_new(status,"input_right",json_integer(device.ir));
    json_object_set_new(status,"callbacks",json_integer(device.callbacks.load()));json_object_set_new(status,"null_inputs",json_integer(device.null_inputs.load()));
    device.result=encode(status);return device.result.c_str();
}
}
