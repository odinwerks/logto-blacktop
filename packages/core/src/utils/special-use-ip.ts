/* eslint-disable unicorn/no-abusive-eslint-disable */
/**
 * @file IANA special-purpose IP address classifier for the SSRF guard in
 * `./outbound-request.ts`.
 *
 * Vendored from `lib/helpers/fetch_request.js` of the `oidc-provider` fork that upstream
 * (`logto-io/logto`) pins, which ships this guard built in. This fork pins the v8 line of
 * `oidc-provider`, where `fetch_request.js` does not exist, so the classifier is maintained
 * here instead of being re-exported through `oidc-provider-internals.ts`. Keep it identical
 * to the provider's copy so both surfaces share one IANA list.
 */
/* eslint-disable */

// IANA IPv4 Special-Purpose Address Space
// https://www.iana.org/assignments/iana-ipv4-special-registry/
const SPECIAL_USE_IPV4 = [
  { prefix: 0x00_00_00_00, mask: 0xff_00_00_00 }, // 0.0.0.0/8 "This network" [RFC791]
  { prefix: 0x0a_00_00_00, mask: 0xff_00_00_00 }, // 10.0.0.0/8 Private-Use [RFC1918]
  { prefix: 0x64_40_00_00, mask: 0xff_c0_00_00 }, // 100.64.0.0/10 Shared Address Space [RFC6598]
  { prefix: 0x7f_00_00_00, mask: 0xff_00_00_00 }, // 127.0.0.0/8 Loopback [RFC1122]
  { prefix: 0xa9_fe_00_00, mask: 0xff_ff_00_00 }, // 169.254.0.0/16 Link Local [RFC3927]
  { prefix: 0xac_10_00_00, mask: 0xff_f0_00_00 }, // 172.16.0.0/12 Private-Use [RFC1918]
  { prefix: 0xc0_00_00_00, mask: 0xff_ff_ff_00 }, // 192.0.0.0/24 IETF Protocol Assignments [RFC6890]
  { prefix: 0xc0_00_02_00, mask: 0xff_ff_ff_00 }, // 192.0.2.0/24 Documentation (TEST-NET-1) [RFC5737]
  { prefix: 0xc0_1f_c4_00, mask: 0xff_ff_ff_00 }, // 192.31.196.0/24 AS112-v4 [RFC7535]
  { prefix: 0xc0_34_c1_00, mask: 0xff_ff_ff_00 }, // 192.52.193.0/24 AMT [RFC7450]
  { prefix: 0xc0_58_63_00, mask: 0xff_ff_ff_00 }, // 192.88.99.0/24 Deprecated (6to4 Relay Anycast) [RFC7526]
  { prefix: 0xc0_a8_00_00, mask: 0xff_ff_00_00 }, // 192.168.0.0/16 Private-Use [RFC1918]
  { prefix: 0xc0_af_30_00, mask: 0xff_ff_ff_00 }, // 192.175.48.0/24 Direct Delegation AS112 Service [RFC7534]
  { prefix: 0xc6_12_00_00, mask: 0xff_fe_00_00 }, // 198.18.0.0/15 Benchmarking [RFC2544]
  { prefix: 0xc6_33_64_00, mask: 0xff_ff_ff_00 }, // 198.51.100.0/24 Documentation (TEST-NET-2) [RFC5737]
  { prefix: 0xcb_00_71_00, mask: 0xff_ff_ff_00 }, // 203.0.113.0/24 Documentation (TEST-NET-3) [RFC5737]
  { prefix: 0xf0_00_00_00, mask: 0xf0_00_00_00 }, // 240.0.0.0/4 Reserved [RFC1112]

  // TCP cannot connect to multicast
  // { prefix: 0xe0000000, mask: 0xf0000000 }, // 224.0.0.0/4 Multicast [RFC1112]
  // TCP cannot connect to broadcast
  // { prefix: 0xffffffff, mask: 0xffffffff }, // 255.255.255.255/32 Limited Broadcast [RFC919][RFC8190]
];

function ipv4ToInt(ip: string): number {
  // Parses an IPv4 dotted-decimal string into an unsigned 32-bit integer
  // without allocating a split('.') array. Walks the string character by
  // character, accumulating each decimal octet then shifting it into the
  // result. The final >>> 0 ensures an unsigned value.
  let result = 0;
  let octet = 0;
  for (let i = 0; i <= ip.length; i++) {
    if (i === ip.length || ip.charCodeAt(i) === 46 /* '.' */) {
      result = result * 256 + octet; // * 256 is equivalent to << 8
      octet = 0;
    } else {
      octet = octet * 10 + ip.charCodeAt(i) - 48; // 48 is '0'.charCodeAt(0)
    }
  }
  return result >>> 0;
}

function expandIPv6(address: string): string {
  // Expands a potentially shortened IPv6 address into a 32-char lowercase
  // hex string (8 groups x 4 hex digits) for prefix matching via startsWith.
  let parts: string[];
  const dcIndex = address.indexOf('::');
  if (dcIndex === -1) {
    parts = address.split(':');
  } else {
    const left = address.slice(0, Math.max(0, dcIndex));
    const right = address.slice(Math.max(0, dcIndex + 2));
    const leftParts = left ? left.split(':') : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    parts = leftParts;
    for (let i = 0; i < missing; i++) {
      parts.push('0000');
    }
    parts.push(...rightParts);
  }
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += parts[i]!.padStart(4, '0');
  }
  return result;
}

// Group CIDR entries by first octet for fast rejection.
// For each of the 256 possible first-octet values, only the entries whose
// range can include that octet are stored, so non-special IPs skip most checks.
const V4_OCTET_BUCKETS: Array<Array<{ prefix: number; mask: number }>> = Array.from(
  { length: 256 },
  () => []
);
for (const entry of SPECIAL_USE_IPV4) {
  const entryStart = (entry.prefix >>> 24) & 0xff;
  const hostBits = (~entry.mask >>> 24) & 0xff;
  for (let o = entryStart; o <= entryStart + hostBits && o < 256; o++) {
    V4_OCTET_BUCKETS[o]!.push(entry);
  }
}

function isSpecialUseIPv4(address: string): boolean {
  const addr = ipv4ToInt(address);
  const bucket = V4_OCTET_BUCKETS[(addr >>> 24) & 0xff];
  if (!bucket) {
    return false;
  }
  for (const { prefix, mask } of bucket) {
    if ((addr & mask) >>> 0 === prefix) {
      return true;
    }
  }
  return false;
}

// IANA IPv6 Special-Purpose Address Space
// https://www.iana.org/assignments/iana-ipv6-special-registry/
// Entries are expanded hex string prefixes matched via startsWith.
// Non-nibble-aligned CIDR ranges are split into nibble-aligned entries.
const SPECIAL_USE_IPV6 = [
  '0064ff9b0000000000000000', // 64:ff9b::/96 IPv4-IPv6 Translat. [RFC6052]
  '0064ff9b0001', // 64:ff9b:1::/48 IPv4-IPv6 Translat. [RFC8215]
  '0100000000000000', // 100::/64 Discard-Only [RFC6666]
  '0100000000000001', // 100:0:0:1::/64 Dummy IPv6 Prefix [RFC9780]
  '200100', // 2001::/23 IETF Protocol Assignments [RFC2928] (1/2)
  '200101', // 2001::/23 IETF Protocol Assignments [RFC2928] (2/2)
  '20010db8', // 2001:db8::/32 Documentation [RFC3849]
  '2002', // 2002::/16 6to4 [RFC3056]
  '2620004f8000', // 2620:4f:8000::/48 Direct Delegation AS112 Service [RFC7534]
  '3fff0', // 3fff::/20 Documentation [RFC9637]
  '5f00', // 5f00::/16 Segment Routing (SRv6) SIDs [RFC9602]
  'fc', // Fc00::/7 Unique-Local [RFC4193] (1/2)
  'fd', // Fc00::/7 Unique-Local [RFC4193] (2/2)
  'fe8', // Fe80::/10 Link-Local Unicast [RFC4291] (1/4)
  'fe9', // Fe80::/10 Link-Local Unicast [RFC4291] (2/4)
  'fea', // Fe80::/10 Link-Local Unicast [RFC4291] (3/4)
  'feb', // Fe80::/10 Link-Local Unicast [RFC4291] (4/4)

  // TCP cannot connect to multicast, also not in the IANA special-use registry
  // 'ff', // ff00::/8 Multicast [RFC4291]

  // Handled explicitly in isSpecialUseIPv6 — cannot use startsWith matching
  // ::1/128 Loopback [RFC4291]
  // ::/128 Unspecified [RFC4291]
  // ::ffff:0:0/96 IPv4-mapped [RFC4291] — delegates to isSpecialUseIPv4
];

// Character-level trie built from prefix strings. Walking the trie is
// 2-3x faster than Map-bucketed startsWith checks because it exits as
// soon as a terminal (matching) or dead-end (non-matching) node is reached.
function hexCharToTrieIndex(code: number): number {
  // '0'-'9' => 0-9, 'a'-'f' => 10-15
  return code <= 57 /* '9' */ ? code - 48 /* '0' */ : code - 87;
}

const TRIE_CHILDREN: Int8Array[] = [];
const TRIE_TERMINAL: number[] = [];
function allocTrieNode(): number {
  const id = TRIE_CHILDREN.length;
  TRIE_CHILDREN.push(new Int8Array(16).fill(-1));
  TRIE_TERMINAL.push(0);
  return id;
}

const IPV6_TRIE_ROOT = allocTrieNode();
for (const prefix of SPECIAL_USE_IPV6) {
  let node = IPV6_TRIE_ROOT;
  for (let i = 0; i < prefix.length; i++) {
    const ci = hexCharToTrieIndex(prefix.charCodeAt(i));
    const children = TRIE_CHILDREN[node]!;
    if (children[ci] === -1) {
      children[ci] = allocTrieNode();
    }
    node = children[ci]!;
  }
  TRIE_TERMINAL[node] = 1;
}

function isSpecialUseIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') {
    return true;
  }
  if (lower.startsWith('::ffff:')) {
    const v4part = lower.slice(7);
    if (v4part.includes('.')) {
      return isSpecialUseIPv4(v4part);
    }
  }
  const full = expandIPv6(lower);
  let node = IPV6_TRIE_ROOT;
  for (let i = 0; i < full.length; i++) {
    if (TRIE_TERMINAL[node]) {
      return true;
    }
    const children = TRIE_CHILDREN[node]!;
    const next = children[hexCharToTrieIndex(full.charCodeAt(i))]!;
    if (next === -1) {
      return false;
    }
    node = next;
  }
  return Boolean(TRIE_TERMINAL[node]);
}

export function isSpecialUseIP(address: string): boolean {
  // Socket.remoteAddress is always a valid IP; colons only appear in IPv6
  if (!address.includes(':')) {
    return isSpecialUseIPv4(address);
  }
  return isSpecialUseIPv6(address);
}

/* eslint-enable */
