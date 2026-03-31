import os from "node:os";
import si from "systeminformation";

const pickPrimaryNic = (stats) => {
  if (!Array.isArray(stats) || !stats.length) return null;
  const nonLoopback = stats.filter((entry) => entry.iface && entry.iface !== "lo" && !entry.iface.startsWith("lo"));
  return nonLoopback[0] || stats[0] || null;
};

export const getSystemHealth = async () => {
  const [cpuLoad, mem, fsSize, disksIo, netStats, osInfo] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.disksIO(),
    si.networkStats(),
    si.osInfo()
  ]);

  const minFilesystemSizeBytes = 1024 * 1024 * 1024;
  const filesystems = fsSize
    .filter((entry) => Number(entry.size) > minFilesystemSizeBytes)
    .map((entry) => ({
      fs: entry.fs || entry.mount || "unknown",
      mount: entry.mount || "",
      total: entry.size,
      used: entry.used,
      free: Math.max(0, entry.size - entry.used),
      usePct: Number((entry.use ?? ((entry.used / entry.size) * 100)).toFixed(2))
    }));

  const primaryNic = pickPrimaryNic(netStats);

  return {
    hostname: os.hostname(),
    uptimeSec: os.uptime(),
    lastBootAt: new Date(Date.now() - os.uptime() * 1000).toISOString(),
    kernelVersion: osInfo?.kernel || os.release(),
    loadAvg: os.loadavg(),
    cpuUsagePct: Number(cpuLoad.currentLoad.toFixed(2)),
    memory: {
      total: mem.total,
      used: mem.used,
      free: mem.free
    },
    diskIo: {
      readBytesSec: Number(disksIo?.rIO_sec || 0),
      writeBytesSec: Number(disksIo?.wIO_sec || 0),
      tps: Number(disksIo?.tIO_sec || 0)
    },
    network: {
      iface: primaryNic?.iface || null,
      rxBytesSec: Number(primaryNic?.rx_sec || 0),
      txBytesSec: Number(primaryNic?.tx_sec || 0),
      rxDropped: Number(primaryNic?.rx_dropped || 0),
      txDropped: Number(primaryNic?.tx_dropped || 0),
      rxErrors: Number(primaryNic?.rx_errors || 0),
      txErrors: Number(primaryNic?.tx_errors || 0)
    },
    filesystems
  };
};
