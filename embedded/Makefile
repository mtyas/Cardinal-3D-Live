NAME = CardinalEmbedded
CARDINAL_VARIANT = native
ifeq ($(EMBEDDED_GRAPHICS),true)
NAME = CardinalEmbeddedGraphics
HEADLESS = false
else
HEADLESS = true
endif
include ../Makefile.cardinal.mk
# Retain the exact module widget factories/DSP used by the working VR build.
# Upstream's headless HostAudio widget omits panel size, knobs and jack layout.
RACK_EXTRA_LIBS := $(subst plugins-headless.a,plugins.a,$(RACK_EXTRA_LIBS))

.PHONY: embedded force-embedded-link
force-embedded-link:
embedded: ../../bin/Cardinal3DEngine.dll
$(BUILD_DIR)/Host.cpp.o: Host.cpp Host.h ShowModules.hpp
	@mkdir -p $(dir $@)
	$(CXX) $< $(BUILD_CXX_FLAGS) -DDISTRHO_PLUGIN_TARGET_STATIC -c -o $@
# DPF's Windows MAPI adapter also contains the plugin implementation; Host.cpp
# supplies that implementation directly, so retain only Cardinal's DSP objects.
$(BUILD_DIR)/DeviceAudio.cpp.o: DeviceAudio.cpp Host.h
	@mkdir -p $(dir $@)
	$(CXX) $< $(BUILD_CXX_FLAGS) -I../../dpf/distrho -I../../../../.tools/asio-sdk/ASIOSDK/common -I../../../../.tools/asio-sdk/ASIOSDK/host -I../../../../.tools/asio-sdk/ASIOSDK/host/pc -I../../src/Rack/dep/rtaudio/include -c -o $@
ASIO_ROOT = ../../../../.tools/asio-sdk/ASIOSDK
ASIO_OBJS = $(BUILD_DIR)/asio-sdk.o $(BUILD_DIR)/asiodrivers-sdk.o $(BUILD_DIR)/asiolist-sdk.o
$(BUILD_DIR)/asio-sdk.o: $(ASIO_ROOT)/common/asio.cpp
	@mkdir -p $(dir $@)
	$(CXX) $< $(BUILD_CXX_FLAGS) -include objbase.h -I$(ASIO_ROOT)/common -I$(ASIO_ROOT)/host -I$(ASIO_ROOT)/host/pc -c -o $@
$(BUILD_DIR)/asiodrivers-sdk.o: $(ASIO_ROOT)/host/asiodrivers.cpp
	@mkdir -p $(dir $@)
	$(CXX) $< $(BUILD_CXX_FLAGS) -include objbase.h -I$(ASIO_ROOT)/common -I$(ASIO_ROOT)/host -I$(ASIO_ROOT)/host/pc -c -o $@
$(BUILD_DIR)/asiolist-sdk.o: $(ASIO_ROOT)/host/pc/asiolist.cpp
	@mkdir -p $(dir $@)
	$(CXX) $< $(BUILD_CXX_FLAGS) -include objbase.h -I$(ASIO_ROOT)/common -I$(ASIO_ROOT)/host -I$(ASIO_ROOT)/host/pc -c -o $@
EMBEDDED_OBJS = $(filter-out %/DistrhoPluginMain_MAPI.cpp.o,$(OBJS_DSP))
ifeq ($(EMBEDDED_GRAPHICS),true)
EMBEDDED_OBJS += $(OBJS_UI) $(BUILD_DIR)/DistrhoUIMain_STATIC.cpp.o
EMBEDDED_LIBS = $(EXTRA_UI_LIBS) $(DGL_LIBS)
../../bin/Cardinal3DEngine.dll: $(DGL_LIB)
endif
../../bin/Cardinal3DEngine.dll: $(EMBEDDED_OBJS) $(BUILD_DIR)/Host.cpp.o $(BUILD_DIR)/DeviceAudio.cpp.o $(ASIO_OBJS) Makefile force-embedded-link
	@mkdir -p $(dir $@)
	$(CXX) $(filter %.o %.a,$^) $(BUILD_CXX_FLAGS) $(LINK_FLAGS) $(EXTRA_LIBS) $(EXTRA_DSP_LIBS) $(EMBEDDED_LIBS) -ldsound -lmfplat -lmfuuid -lwmcodecdspuuid -lksuser -lwinmm -lole32 -luuid -shared -Wl,--out-implib,../../bin/libCardinal3DEngine.dll.a -o $@
