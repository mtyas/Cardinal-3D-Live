"""Exact pinned Host Audio 2 input-only capture cursor correction."""
def patch_host_audio(text):
    marker = '        // Cardinal 3D: capture advances even without a stereo output cable.\n'
    if marker in text:
        return text
    anchor = '    void processTerminalOutput(const ProcessArgs&) override\n    {\n        if (pcontext->bypassed || (!in1connected && !in2connected))'
    if text.count(anchor) != 1:
        raise RuntimeError('Unexpected Host Audio 2 terminal-output implementation')
    start = text.index(anchor)
    cursor = '        // only incremented on output\n        const uint32_t k = dataFrame++;\n'
    end = text.index(cursor, start) + len(cursor)
    block = text[start:end]
    replacement = block.replace('    {\n', '    {\n' + marker + '        const uint32_t k = dataFrame++;\n', 1).replace(cursor, '')
    return text[:start] + replacement + text[end:]
