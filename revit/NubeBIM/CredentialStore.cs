using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
namespace NubeBIM {
 // Windows Credential Manager: no license key or bearer token is stored in a plain-text file.
 internal static class CredentialStore {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct Credential {
   public uint Flags,Type;public string TargetName;public string? Comment;public long LastWritten;
   public uint CredentialBlobSize;public IntPtr CredentialBlob;public uint Persist,AttributeCount;
   public IntPtr Attributes;public string? TargetAlias;public string? UserName;
  }
  [DllImport("advapi32.dll",EntryPoint="CredWriteW",CharSet=CharSet.Unicode,SetLastError=true)]private static extern bool Write(ref Credential c,uint flags);
  [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)]private static extern bool Read(string target,uint type,uint flags,out IntPtr ptr);
  [DllImport("advapi32.dll",EntryPoint="CredDeleteW",CharSet=CharSet.Unicode,SetLastError=true)]private static extern bool Delete(string target,uint type,uint flags);
  [DllImport("advapi32.dll")]private static extern void CredFree(IntPtr p);
  public static void Save(string target,string token){var bytes=Encoding.Unicode.GetBytes(token);var p=Marshal.AllocHGlobal(bytes.Length);try{Marshal.Copy(bytes,0,p,bytes.Length);var c=new Credential{Type=1,TargetName=target,CredentialBlobSize=(uint)bytes.Length,CredentialBlob=p,Persist=2,UserName="NubeBIM"};if(!Write(ref c,0))throw new Win32Exception(Marshal.GetLastWin32Error());}finally{for(var i=0;i<bytes.Length;i++)Marshal.WriteByte(p,i,0);Marshal.FreeHGlobal(p);Array.Clear(bytes,0,bytes.Length);}}
  public static string Load(string target){if(!Read(target,1,0,out var p))return "";try{var c=Marshal.PtrToStructure<Credential>(p);if(c.CredentialBlobSize>4096)return "";var b=new byte[c.CredentialBlobSize];Marshal.Copy(c.CredentialBlob,b,0,b.Length);return Encoding.Unicode.GetString(b);}finally{CredFree(p);}}
  public static void Clear(string target){Delete(target,1,0);}
 }
}
