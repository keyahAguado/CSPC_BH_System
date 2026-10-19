import { formalDatesInText } from './dateHelper.js';
// Return text segments, never HTML. Owner-entered reasons remain escaped by Vue. Calendar dates are shown formally.
export function messageSegments(value) {
  const text=formalDatesInText(value),ranges=[];
  const reason=/\bReason:\s*([\s\S]*?)(?=\s+(?:Your booking|The reservation|No payment|Its booked dates|Other bookings|Payment outcome|Contact the owner|Refund reference|Agreement details|No bed is held|The existing stay record|The platform cannot)\b|$)/gi;
  for(const match of text.matchAll(reason))ranges.push([match.index,match.index+match[0].length]);
  const important=/(?:REF|NC)-\d+|\bRoom\s+[A-Za-z0-9-]+|\u20b1[\d,]+(?:\.\d+)?|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}(?:\s*[·-]?\s*\d{1,2}:\d{2}\s*[AP]M)?|\b(?:not approved yet|no payment is due|do not pay|dates remain held|payment deadline|response deadline|expires automatically)\b/gi;
  for(const match of text.matchAll(important))ranges.push([match.index,match.index+match[0].length]);
  ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const range of ranges){const last=merged.at(-1);if(last && range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
  const result=[];let offset=0;
  for(const [start,end] of merged){if(start>offset)result.push({text:text.slice(offset,start),strong:false});result.push({text:text.slice(start,end),strong:true});offset=end;}
  if(offset<text.length)result.push({text:text.slice(offset),strong:false});
  return result;
}
