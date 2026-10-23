// SPDX-License-Identifier: GPL-3.0-or-later
export function audioQuality(guest,cap=128){
 const requested=guest.member?.audioQuality||'auto';
 return Math.min(cap,requested==='auto'?(guest.lowData||guest.bufferedAmount>32*1024?64:96):Number(requested));
}
