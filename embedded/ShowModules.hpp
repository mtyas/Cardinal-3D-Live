// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <rack.hpp>
#include <atomic>
#include <array>
#include <cstring>
#include <algorithm>

namespace cardinal3d { namespace show {
using namespace rack;
struct AudioRing {
    static constexpr uint32_t capacity = 32768;
    std::array<float, capacity> audio{};
    std::array<uint64_t, capacity> frames{};
    std::atomic<uint32_t> write{0}, read{0}, dropped{0};
};
struct MonitorSource {
 AudioRing ring;
 std::array<std::atomic<float>,10> values{};
 std::array<float,256> delay{};
 uint32_t cursor=0;
 float filtered=0,leftGain=0,rightGain=0,delaySamples=0;
};
struct Speaker : engine::Module {
    enum { GAIN, X, Y, Z, YAW, MODE, CONE, DISTANCE, ROLLOFF, MAX_DISTANCE, PARAMS };
    std::shared_ptr<MonitorSource> monitor=std::make_shared<MonitorSource>();
    std::array<std::atomic<float>, PARAMS>& values=monitor->values;
    std::shared_ptr<AudioRing> stream = std::make_shared<AudioRing>();
    Speaker() {
        config(PARAMS, 7, 1, 0);
        configParam(GAIN, 0, 2, 1, "Gain");
        configParam(X, -20, 20, -2, "Position X", " m");
        configParam(Y, 0, 10, 1.5, "Position Y", " m");
        configParam(Z, -20, 20, -3, "Position Z", " m");
        configParam(YAW, -180, 180, 0, "Direction", " degrees");
        configSwitch(MODE, 0, 1, 0, "Emission", {"Omnidirectional", "Directional"});
        configParam(CONE, 15, 180, 90, "Directional cone", " degrees");
        configParam(DISTANCE, .1, 10, 1, "Reference distance", " m");
        configParam(ROLLOFF, 0, 4, 1, "Distance rolloff");
        configParam(MAX_DISTANCE, 1, 100, 40, "Maximum distance", " m");
        const char* cvNames[] = {"Gain CV (0 to 10 V multiplier)", "Position X CV (1 metre/V offset)", "Position Y CV (1 metre/V offset)", "Position Z CV (1 metre/V offset)", "Direction CV (18 degrees/V offset)", "Cone CV (15 degrees/V offset)"};
        for (int i=0;i<6;++i) configInput(i+1, cvNames[i]);
        for (int i=0;i<PARAMS;++i) values[i].store(params[i].getValue());
        configInput(0, "Audio to virtual speaker (mono)"); configOutput(0, "Audio monitor passthrough");
    }
    void process(const ProcessArgs& args) override {
        for (int i=0;i<PARAMS;++i) values[i].store(params[i].getValue(), std::memory_order_relaxed);
        if(inputs[1].isConnected()) values[GAIN].store(params[GAIN].getValue()*std::max(0.f,std::min(1.f,inputs[1].getVoltage()/10.f)));
        const int destinations[]={X,Y,Z,YAW,CONE};
        for(int i=0;i<5;++i) if(inputs[i+2].isConnected()) {
            const int target=destinations[i]; const float scale=target==YAW?18.f:target==CONE?15.f:1.f;
            float v=params[target].getValue()+inputs[i+2].getVoltage()*scale;
            const float lo=target==Y?0.f:target==YAW?-180.f:target==CONE?15.f:-20.f;
            const float hi=target==Y?10.f:target==YAW?180.f:target==CONE?180.f:20.f;
            values[target].store(std::isfinite(v)?std::max(lo,std::min(hi,v)):params[target].getValue());
        }
        const float voltage = inputs[0].getVoltageSum() * values[GAIN].load();
        outputs[0].setVoltage(voltage);
        auto& monitorRing=monitor->ring;const uint32_t mw=monitorRing.write.load(std::memory_order_relaxed);
        if(mw-monitorRing.read.load(std::memory_order_acquire)<AudioRing::capacity){monitorRing.audio[mw%AudioRing::capacity]=std::isfinite(voltage)?voltage/10.f:0.f;monitorRing.write.store(mw+1,std::memory_order_release);}
        auto& ring = *stream;
        const uint32_t w = ring.write.load(std::memory_order_relaxed);
        if (w - ring.read.load(std::memory_order_acquire) >= AudioRing::capacity) { ring.dropped.fetch_add(1, std::memory_order_relaxed); return; }
        ring.audio[w % AudioRing::capacity] = std::isfinite(voltage) ? std::max(-1.f, std::min(1.f, voltage / 10.f)) : 0.f;
        ring.frames[w % AudioRing::capacity] = uint64_t(args.frame);
        ring.write.store(w + 1, std::memory_order_release);
    }
};
struct Light : engine::Module {
    enum { BRIGHTNESS, RED, GREEN, BLUE, WIDTH, X, Y, Z, YAW, PARAMS };
    std::array<std::atomic<float>, PARAMS> values{};
    Light() {
        config(PARAMS, PARAMS, 0, 0);
        const char* names[] = {"Brightness", "Red", "Green", "Blue", "Beam width", "Position X", "Position Y", "Position Z", "Direction"};
        const float low[] = {0,0,0,0,5,-20,0,-20,-180};
        const float high[] = {4,1,1,1,160,20,10,20,180};
        const float defaults[] = {1,.3,.8,1,45,0,3,-3,0};
        for (int i = 0; i < PARAMS; ++i) { configParam(i, low[i], high[i], defaults[i], names[i]); configInput(i, names[i]); values[i].store(defaults[i]); }
    }
    void process(const ProcessArgs&) override {
        for (int i = 0; i < PARAMS; ++i) {
            float value = params[i].getValue();
            if (inputs[i].isConnected()) {
                const float cv = inputs[i].getVoltage();
                if (i <= BLUE) value = cv / 10.f * (i == BRIGHTNESS ? 4.f : 1.f);
                else if (i == WIDTH) value = 5.f + cv / 10.f * 155.f;
                else value += cv * (i == YAW ? 18.f : 1.f);
            }
            const float low = i == YAW ? -180.f : i == X || i == Z ? -20.f : i == WIDTH ? 5.f : 0.f;
            const float high = i == BRIGHTNESS ? 4.f : i <= BLUE ? 1.f : i == WIDTH ? 160.f : i == Y ? 10.f : i == YAW ? 180.f : 20.f;
            values[i].store(std::isfinite(value) ? std::max(low, std::min(high, value)) : low, std::memory_order_relaxed);
        }
    }
};

inline const char* glyph(char ch) { switch(ch) {
case 'A': return "01110100011000111111100011000110001";
case 'B': return "11110100011000111110100011000111110";
case 'C': return "01111100001000010000100001000001111";
case 'D': return "11110100011000110001100011000111110";
case 'E': return "11111100001000011110100001000011111";
case 'F': return "11111100001000011110100001000010000";
case 'G': return "01111100001000010111100011000101111";
case 'H': return "10001100011000111111100011000110001";
case 'I': return "11111001000010000100001000010011111";
case 'J': return "00111000100001000010000101001001100";
case 'K': return "10001100101010011000101001001010001";
case 'L': return "10000100001000010000100001000011111";
case 'M': return "10001110111010110101100011000110001";
case 'N': return "10001110011010110011100011000110001";
case 'O': return "01110100011000110001100011000101110";
case 'P': return "11110100011000111110100001000010000";
case 'Q': return "01110100011000110001101011001001101";
case 'R': return "11110100011000111110101001001010001";
case 'S': return "01111100001000001110000010000111110";
case 'T': return "11111001000010000100001000010000100";
case 'U': return "10001100011000110001100011000101110";
case 'V': return "10001100011000110001100010101000100";
case 'W': return "10001100011000110101101011101110001";
case 'X': return "10001100010101000100010101000110001";
case 'Y': return "10001100010101000100001000010000100";
case 'Z': return "11111000010001000100010001000011111";
default:return "00000000000000000000000000000000000"; }}
inline std::string labelSvg(const std::string& text,float cx,float y,float scale=1.f,const char* color="#e2edf1") {
    std::string path; float left=cx-float(text.size()*6-1)*scale/2;
    for(size_t n=0;n<text.size();++n) for(int j=0;j<35;++j) if(glyph(text[n])[j]=='1')
        path+="M"+std::to_string(left+(n*6+j%5)*scale)+" "+std::to_string(y+(j/5)*scale)+"h"+std::to_string(scale)+"v"+std::to_string(scale)+"h-"+std::to_string(scale)+"z";
    return "<path fill='"+std::string(color)+"' d='"+path+"'/>";
}
inline std::shared_ptr<window::Svg> panel(bool speaker) {
    auto svg=std::make_shared<window::Svg>();
    std::string body="<svg xmlns='http://www.w3.org/2000/svg' width='150' height='380'><rect width='150' height='380' fill='#142b39'/><rect x='5' y='9' width='140' height='28' rx='3' fill='"+std::string(speaker?"#65e7ff":"#bd83ff")+"'/>";
    body+=labelSvg(speaker?"SHOW SPEAKER":"SHOW LIGHT",75,19,1.15,"#142b39");
    if(speaker){
        const char* names[]={"GAIN","X","Y","Z","YAW","MODE","CONE","REF M","ROLL","MAX M"};
        const float x[]={25,25,75,125,25,125,75,25,75,125};
        const float y[]={55,112,112,112,170,55,170,225,225,225};
        for(int i=0;i<10;++i)body+=labelSvg(names[i],x[i],y[i],.9);
        const char* cv[]={"GAIN CV","X CV","Y CV","Z CV","YAW CV","CONE CV"};
        for(int i=0;i<6;++i)body+=labelSvg(cv[i],25+(i%3)*50,278+(i/3)*34,.8);
        body+=labelSvg("AUDIO IN",40,340,.8)+labelSvg("MONITOR",110,340,.8);
    } else {
        const char* names[]={"BRIGHT","RED","GREEN","BLUE","WIDTH","X","Y","Z","YAW"};
        for(int i=0;i<9;++i){body+=labelSvg(names[i],25+(i%3)*50,62+(i/3)*100,.85);body+=labelSvg("CV",25+(i%3)*50,107+(i/3)*100,.8);}
    }
    svg->loadString(body+"</svg>");return svg;
}
struct SpeakerWidget : app::ModuleWidget {
    SpeakerWidget(Speaker* m) {
        setModule(m); setPanel(panel(true));
        const math::Vec positions[] = {{25,78},{25,135},{75,135},{125,135},{25,192},{125,78},{75,192},{25,248},{75,248},{125,248}};
        for (int i = 0; i < Speaker::PARAMS; ++i) addParam(createParamCentered<RoundBlackKnob>(positions[i], m, i));
        for(int i=0;i<6;++i)addInput(createInputCentered<PJ301MPort>({float(25+(i%3)*50),float(296+(i/3)*34)},m,i+1));
        addInput(createInputCentered<PJ301MPort>({40,360}, m, 0));
        addOutput(createOutputCentered<PJ301MPort>({110,360}, m, 0));
    }
};
struct LightWidget : app::ModuleWidget {
    LightWidget(Light* m) {
        setModule(m); setPanel(panel(false));
        for (int i = 0; i < Light::PARAMS; ++i) {
            const math::Vec position(25 + (i % 3) * 50, 85 + (i / 3) * 100);
            addParam(createParamCentered<RoundBlackKnob>(position, m, i));
            addInput(createInputCentered<PJ301MPort>(position.plus({0,38}), m, i));
        }
    }
};

// Shared controls and DSP-clock animation for the four stage-object modules.
struct Visual : engine::Module {
    enum { LEVEL, RATE, SCALE, RED, GREEN, BLUE, X, Y, Z, YAW, SPREAD, STYLE, PARAMS };
    std::array<std::atomic<float>, PARAMS> values{};
    std::atomic<float> phase{0}, frequency{1};
    const int kind;
    double cycle=0, clockAge=0, period=1;
    dsp::SchmittTrigger clockTrigger, resetTrigger;
    explicit Visual(int type) : kind(type) {
        config(PARAMS,PARAMS+2,0,0);
        const char* names[]={"Activity","Animation speed","Object size","Red","Green","Blue","Position X","Position Y","Position Z","Direction","Spread","Style"};
        const float low[]={0,.05f,.1f,0,0,0,-20,0,-20,-180,.05f,0};
        const float high[]={1,4,4,1,1,1,20,10,20,180,3,2};
        const float defaults[]={.8f,1,1,.25f,.75f,1,0,0,-4,0,1,0};
        for(int i=0;i<PARAMS;++i){configParam(i,low[i],high[i],defaults[i],names[i]);configInput(i,names[i]+std::string(" CV"));values[i].store(defaults[i]);}
        getParamQuantity(STYLE)->snapEnabled=true;
        configInput(PARAMS,"Clock (sets animation tempo; Speed multiplies it)");
        configInput(PARAMS+1,"Reset animation phase");
    }
    void process(const ProcessArgs& args) override {
        const float low[]={0,.05f,.1f,0,0,0,-20,0,-20,-180,.05f,0};
        const float high[]={1,4,4,1,1,1,20,10,20,180,3,2};
        for(int i=0;i<PARAMS;++i){
            float v=params[i].getValue();
            if(inputs[i].isConnected()){
                float cv=inputs[i].getVoltage();
                if(i==LEVEL||i==RED||i==GREEN||i==BLUE)v=cv/10;
                else if(i==STYLE)v=cv/5;
                else v+=cv*(i==YAW?18.f:i==RATE?.2f:i==SCALE||i==SPREAD?.2f:1.f);
            }
            values[i].store(std::isfinite(v)?std::max(low[i],std::min(high[i],v)):low[i],std::memory_order_relaxed);
        }
        clockAge+=args.sampleTime;
        if(clockTrigger.process(inputs[PARAMS].getVoltage())){
            if(clockAge>.005)period=clockAge;
            clockAge=0;cycle=0;
        }
        if(resetTrigger.process(inputs[PARAMS+1].getVoltage()))cycle=0;
        const float hz=values[RATE].load(std::memory_order_relaxed)*(inputs[PARAMS].isConnected()?float(1/std::max(.05,period)):1.f);
        cycle+=args.sampleTime*hz;cycle-=std::floor(cycle);
        phase.store(float(cycle),std::memory_order_relaxed);frequency.store(hz,std::memory_order_relaxed);
    }
};
struct Figure : Visual { Figure():Visual(0){} };
struct Fountain : Visual { Fountain():Visual(1){} };
struct Particles : Visual { Particles():Visual(2){} };
struct Sculpture : Visual { Sculpture():Visual(3){} };
inline std::shared_ptr<window::Svg> visualPanel(const char* name){
    auto svg=std::make_shared<window::Svg>();
    std::string body="<svg xmlns='http://www.w3.org/2000/svg' width='180' height='380'><rect width='180' height='380' fill='#172c38'/><rect x='5' y='9' width='170' height='27' rx='3' fill='#ffd365'/>";
    body+=labelSvg(name,90,19,1.0,"#172c38");
    const char* labels[]={"ACTIVITY","SPEED","SIZE","RED","GREEN","BLUE","X","Y","Z","YAW","SPREAD","STYLE"};
    for(int i=0;i<12;++i){float x=30+(i%3)*60,y=50+(i/3)*72;body+=labelSvg(labels[i],x,y,.9);body+=labelSvg("CV",x,y+46,.75);}
    body+=labelSvg("CLOCK",45,342,.9)+labelSvg("RESET",135,342,.9);
    svg->loadString(body+"</svg>");return svg;
}
template<class T> struct VisualWidget : app::ModuleWidget {
    VisualWidget(T* m){
        setModule(m);const char* names[]={"SHOW FIGURE","SHOW FOUNTAIN","SHOW PARTICLES","SHOW SCULPTURE"};T preview;
        setPanel(visualPanel(names[m?m->kind:preview.kind]));
        for(int i=0;i<Visual::PARAMS;++i){math::Vec p(30+(i%3)*60,73+(i/3)*72);addParam(createParamCentered<RoundBlackKnob>(p,m,i));addInput(createInputCentered<PJ301MPort>(p.plus({0,36}),m,i));}
        addInput(createInputCentered<PJ301MPort>({45,363},m,Visual::PARAMS));addInput(createInputCentered<PJ301MPort>({135,363},m,Visual::PARAMS+1));
    }
};


struct ChatBoard : engine::Module {
 enum {WIDTH,HEIGHT,FONT,RED,GREEN,BLUE,BGRED,BGGREEN,BGBLUE,X,Y,Z,YAW,VISIBLE,PARAMS};
 std::array<std::atomic<float>,PARAMS> values{};
 ChatBoard(){
  config(PARAMS,PARAMS,0,0);
  const char* names[]={"Board width","Board height","Text size","Text red","Text green","Text blue","Background red","Background green","Background blue","Position X","Position Y","Position Z","Direction","Visible"};
  const float low[]={.5f,.5f,.025f,0,0,0,0,0,0,-20,0,-20,-180,0},high[]={8,6,.2f,1,1,1,1,1,1,20,10,20,180,1},defaults[]={3,2,.065f,.85f,.95f,1,.04f,.08f,.14f,3,1.8f,-3,0,1};
  for(int i=0;i<PARAMS;++i){configParam(i,low[i],high[i],defaults[i],names[i]);configInput(i,std::string(names[i])+" CV");values[i].store(defaults[i]);}
  getParamQuantity(VISIBLE)->snapEnabled=true;
 }
 void process(const ProcessArgs&) override {
  const float low[]={.5f,.5f,.025f,0,0,0,0,0,0,-20,0,-20,-180,0},high[]={8,6,.2f,1,1,1,1,1,1,20,10,20,180,1};
  for(int i=0;i<PARAMS;++i){float v=params[i].getValue();if(inputs[i].isConnected()){const float cv=inputs[i].getVoltage();if(i>=RED&&i<=BGBLUE||i==VISIBLE)v=cv/10;else v+=cv*(i==FONT?.01f:i==YAW?18.f:1.f);}values[i].store(std::isfinite(v)?std::max(low[i],std::min(high[i],v)):low[i],std::memory_order_relaxed);}
 }
};
struct ChatBoardWidget : app::ModuleWidget {
 ChatBoardWidget(ChatBoard* m){
  setModule(m);auto svg=std::make_shared<window::Svg>();
  std::string body="<svg xmlns='http://www.w3.org/2000/svg' width='180' height='380'><rect width='180' height='380' fill='#172c38'/><rect x='5' y='9' width='170' height='27' rx='3' fill='#83e7ff'/>";
  body+=labelSvg("SHOW CHAT BOARD",90,19,.9,"#172c38");
  const char* labels[]={"WIDTH","HEIGHT","TEXT SIZE","TEXT R","TEXT G","TEXT B","BOARD R","BOARD G","BOARD B","X","Y","Z","YAW","VISIBLE"};
  for(int i=0;i<ChatBoard::PARAMS;++i){float x=30+(i%3)*60,y=50+(i/3)*63;body+=labelSvg(labels[i],x,y,.75);body+=labelSvg("CV",x,y+44,.7);}
  svg->loadString(body+"</svg>");setPanel(svg);
  for(int i=0;i<ChatBoard::PARAMS;++i){math::Vec p(30+(i%3)*60,70+(i/3)*63);addParam(createParamCentered<RoundBlackKnob>(p,m,i));addInput(createInputCentered<PJ301MPort>(p.plus({0,32}),m,i));}
 }
};
inline void registerPlugin(const std::string& resources) {
    if (plugin::getPlugin("Cardinal3DShow")) return;
    auto* p = new plugin::Plugin;
    json_error_t error;
    json_t* manifest = json_loads(R"({"slug":"Cardinal3DShow","name":"Cardinal 3D Show","brand":"Cardinal 3D","version":"2.78.0","license":"GPL-3.0-or-later","author":"mtyas","modules":[{"slug":"ShowChatBoard","name":"Show Chat Board","description":"Shared world-space audience chat board with CV controls","tags":["Visual"]},{"slug":"ShowSpeaker","name":"Show Speaker","description":"Independent spatial sound source","tags":["External","Output"]},{"slug":"ShowLight","name":"Show Light","description":"CV-controlled virtual light","tags":["Visual"]},{"slug":"ShowFigure","name":"Show Figure","description":"Clock and CV controlled stage object","tags":["Visual"]},{"slug":"ShowFountain","name":"Show Fountain","description":"Clock and CV controlled stage object","tags":["Visual"]},{"slug":"ShowParticles","name":"Show Particles","description":"Clock and CV controlled stage object","tags":["Visual"]},{"slug":"ShowSculpture","name":"Show Sculpture","description":"Clock and CV controlled stage object","tags":["Visual"]}]})", 0, &error);
    p->path = resources; p->fromJson(manifest);
    p->addModel(rack::createModel<ChatBoard,ChatBoardWidget>("ShowChatBoard"));
    p->addModel(rack::createModel<Speaker, SpeakerWidget>("ShowSpeaker"));
    p->addModel(rack::createModel<Light, LightWidget>("ShowLight"));
    p->addModel(rack::createModel<Figure, VisualWidget<Figure>>("ShowFigure"));
    p->addModel(rack::createModel<Fountain, VisualWidget<Fountain>>("ShowFountain"));
    p->addModel(rack::createModel<Particles, VisualWidget<Particles>>("ShowParticles"));
    p->addModel(rack::createModel<Sculpture, VisualWidget<Sculpture>>("ShowSculpture"));
    p->modulesFromJson(json_object_get(manifest, "modules")); json_decref(manifest); plugin::plugins.push_back(p);
}
} }
