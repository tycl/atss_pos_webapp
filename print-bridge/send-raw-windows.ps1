# Sends raw bytes straight to a Windows printer by name via the Print
# Spooler's native WritePrinter API (winspool.drv), using a RAW datatype job
# so the ESC/POS bytes reach the printer unmodified — this is the supported
# way to raw-print to a USB-class printer (port names like "USB001" are a
# Print Spooler construct, not a real device `copy` can target).
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "ATSS Receipt";
        di.pDataType = "RAW";

        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new InvalidOperationException("OpenPrinter failed for '" + printerName + "' (error " + Marshal.GetLastWin32Error() + ")");
        try
        {
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new InvalidOperationException("StartDocPrinter failed (error " + Marshal.GetLastWin32Error() + ")");
            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new InvalidOperationException("StartPagePrinter failed (error " + Marshal.GetLastWin32Error() + ")");

                IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written) || written != bytes.Length)
                        throw new InvalidOperationException("WritePrinter failed or wrote " + written + "/" + bytes.Length + " bytes (error " + Marshal.GetLastWin32Error() + ")");
                }
                finally
                {
                    Marshal.FreeCoTaskMem(pUnmanaged);
                    EndPagePrinter(hPrinter);
                }
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes)
