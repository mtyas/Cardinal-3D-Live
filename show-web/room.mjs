// SPDX-License-Identifier: GPL-3.0-or-later
import { randomUUID } from 'node:crypto';

export class Room {
  constructor(now = Date.now, capacity = 64) { this.now = now; this.capacity=capacity; }
  members = new Map();
  reactionReady = new Map();
  chat = [];
  performer = null;
  join(isPerformer = false) {
    if (this.members.size >= this.capacity) throw new Error('Room is full');
    if (isPerformer && this.performer) throw new Error('Performer is already connected');
    const id = randomUUID();
    const member = { id, role: isPerformer ? 'performer' : 'visitor', name: isPerformer ? 'Performer' : 'Visitor', color: '#65e7ff', color2: '#bd83ff', pattern: 'gradient', position: [0, 1.65, 4], yaw: 0 };
    this.members.set(id, member);
    if (isPerformer) this.performer = id;
    return member;
  }
  leave(id) { this.members.delete(id); this.reactionReady.delete(id); if (this.performer === id) this.performer = null; }
  update(id, data) {
    const m = this.members.get(id);
    if (!m) return;
    if (data.type === 'identity') {
      if (typeof data.name === 'string') m.name = data.name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 32) || 'Visitor';
      if (/^#[0-9a-f]{6}$/i.test(data.color)) m.color = data.color;
      if (/^#[0-9a-f]{6}$/i.test(data.color2)) m.color2 = data.color2;
      if (['solid', 'gradient', 'noise', 'marble'].includes(data.pattern)) m.pattern = data.pattern;
    } else if (data.type === 'audio_quality') {
      if (['auto','64','96','128'].includes(data.quality)) m.audioQuality = data.quality;
    } else if (data.type === 'reaction') {
      const now = this.now();
      if (!['glow', 'sparkles', 'shake', 'grow'].includes(data.kind) || now < (this.reactionReady.get(id) || 0)) return;
      m.reaction = { kind: data.kind, startedAt: now, endsAt: now + 3200 };
      this.reactionReady.set(id, now + 3500);
    } else if (data.type === 'pose') {
      if (Array.isArray(data.position) && data.position.length === 3 && data.position.every(v => Number.isFinite(v) && Math.abs(v) <= 100)) m.position = [...data.position];
      if (Number.isFinite(data.yaw)) m.yaw = Math.atan2(Math.sin(data.yaw), Math.cos(data.yaw));
    } else if (data.type === 'chat' && typeof data.text === 'string') {
      const text = data.text.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 400);
      if (text) {
        this.chat.push({ id: randomUUID(), name: m.name, color: m.color, text });
        this.chat = this.chat.slice(-40);
      }
    }
    // There is deliberately no synth-edit command on the visitor protocol.
  }
  snapshot() {
    const serverTime = this.now();
    for (const member of this.members.values()) if (member.reaction?.endsAt <= serverTime) delete member.reaction;
    return { type: 'room', serverTime, members: [...this.members.values()], chat: this.chat };
  }
}
