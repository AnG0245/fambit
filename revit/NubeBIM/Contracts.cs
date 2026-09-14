using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
namespace NubeBIM {
 public static class Json {
  public static T Read<T>(string text){using(var s=new MemoryStream(Encoding.UTF8.GetBytes(text)))return (T)new DataContractJsonSerializer(typeof(T)).ReadObject(s);}
  public static string Write<T>(T value){using(var s=new MemoryStream()){new DataContractJsonSerializer(typeof(T)).WriteObject(s,value);return Encoding.UTF8.GetString(s.ToArray());}}
 }
 [DataContract] public sealed class Config{[DataMember(Name="apiBaseUrl")]public string ApiBaseUrl{get;set;}="";}
 [DataContract] public sealed class ActivationRequest {
  [DataMember(Name="email")]public string Email{get;set;}="";
  [DataMember(Name="key")]public string Key{get;set;}="";
  [DataMember(Name="deviceId")]public string DeviceId{get;set;}="";
  [DataMember(Name="deviceName")]public string DeviceName{get;set;}="";
 }
 [DataContract] public sealed class ActivationResult{[DataMember(Name="token")]public string Token{get;set;}="";[DataMember(Name="name")]public string Name{get;set;}="";}
 [DataContract] public sealed class ErrorResult{[DataMember(Name="error")]public string Error{get;set;}="";}
 [DataContract] public sealed class FamilyResult{[DataMember(Name="families")]public List<FamilyInfo> Families{get;set;}=new List<FamilyInfo>();[DataMember(Name="nextCursor")]public string? NextCursor{get;set;}}
 [DataContract] public sealed class FamilyInfo {
  [DataMember(Name="id")]public string Id{get;set;}="";[DataMember(Name="name")]public string Name{get;set;}="";
  [DataMember(Name="category")]public string Category{get;set;}="";[DataMember(Name="subcategory")]public string Subcategory{get;set;}="";[DataMember(Name="hasThumbnail")]public bool HasThumbnail{get;set;}[DataMember(Name="description")]public string Description{get;set;}="";
  [DataMember(Name="revit")]public int Revit{get;set;}[DataMember(Name="revision")]public int Revision{get;set;}
  [DataMember(Name="sha256")]public string Sha256{get;set;}="";[DataMember(Name="size")]public long Size{get;set;}
  public string VersionLabel=>"Revit "+Revit+"+ · revisión "+Revision;
 }
 [DataContract] public sealed class CategoryResult{[DataMember(Name="categories")]public List<CategoryInfo> Categories{get;set;}=new List<CategoryInfo>();}
 [DataContract] public sealed class CategoryInfo {
  [DataMember(Name="id")]public string Id{get;set;}="";[DataMember(Name="name")]public string Name{get;set;}="";
  [DataMember(Name="detail")]public string Detail{get;set;}="";[DataMember(Name="color")]public string Color{get;set;}="";
  [DataMember(Name="subcategories")]public List<SubcategoryInfo> Subcategories{get;set;}=new List<SubcategoryInfo>();
 }
 [DataContract] public sealed class SubcategoryInfo{[DataMember(Name="id")]public string Id{get;set;}="";[DataMember(Name="name")]public string Name{get;set;}="";}
 [DataContract] public sealed class ReleaseResult{[DataMember(Name="releases")]public List<ReleaseInfo> Releases{get;set;}=new List<ReleaseInfo>();}
 [DataContract] public sealed class ReleaseInfo {
  [DataMember(Name="version")]public string Version{get;set;}="";[DataMember(Name="url")]public string Url{get;set;}="";
  [DataMember(Name="sha256")]public string Sha256{get;set;}="";[DataMember(Name="notes")]public string Notes{get;set;}="";
 }
}
