using System;
using System.ComponentModel;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
namespace NubeBIM {
 public sealed class Palette {
  public Brush Background{get;}
  public Brush Foreground{get;}
  private Palette(string background,string foreground){var b=(SolidColorBrush)new BrushConverter().ConvertFromString(background);b.Freeze();Background=b;var f=(SolidColorBrush)new BrushConverter().ConvertFromString(foreground);f.Freeze();Foreground=f;}
  public static Palette For(string color)=>new Palette("#F8F9FA","#68717D");
 }
 public sealed class CategoryCard {
  public CategoryInfo Info{get;}
  public string Name=>Info.Name;
  public string Count{get;}
  public Brush Background{get;}
  public Brush Foreground{get;}
  public Geometry Icon{get;}
  public CategoryCard(CategoryInfo info,int count){Info=info;Count=count.ToString(CultureInfo.CurrentCulture);var palette=Palette.For(info.Color);Background=palette.Background;Foreground=palette.Foreground;Icon=Geometry.Parse(IconPath(info.Id));Icon.Freeze();}
  // Functional line icons; all use a 24 x 24 coordinate system.
  private static string IconPath(string id){switch(id){case "arquitectura":return "M4,21 L4,3 L15,3 L15,21 M15,9 L20,9 L20,21 M2,21 L22,21 M7,7 L8,7 M11,7 L12,7 M7,11 L8,11 M11,11 L12,11 M8,21 L8,16 L11,16 L11,21";case "estructura":return "M3,4 L21,4 L21,7 L3,7 Z M5,7 L8,7 L8,20 L5,20 Z M16,7 L19,7 L19,20 L16,20 Z M3,20 L21,20";case "sanitarias":return "M3,12 L21,12 L20,17 L18,19 L6,19 L4,17 Z M6,12 L6,5 C6,1 11,1 11,5 M8,21 L8,19 M17,21 L17,19 M9,6 L13,6";case "electricas":return "M9,17 C9,14 5,13 5,8 C5,0 19,0 19,8 C19,13 15,14 15,17 Z M9,20 L15,20 M10,23 L14,23 M12,16 L12,10 M9,8 L12,11 L15,8";default:return "M3,6 L12,2 L21,6 L21,18 L12,22 L3,18 Z M3,6 L12,10 L21,6 M12,10 L12,22 M7,4 L16,8";}}
 }
 public sealed class FamilyCard:INotifyPropertyChanged {
  public FamilyInfo Info{get;}
  public string Name=>Info.Name;
  public string Tooltip=>Name+"\n"+CategoryLabel+" · "+Version+"\nCargar y colocar en el proyecto";
  public string Version=>"Revit "+Info.Revit+"+";
  public string CategoryLabel{get;}
  public Brush Background{get;}
  public Brush Foreground{get;}
  private ImageSource? _image;
  public ImageSource? Image{get=>_image;set{_image=value;Changed(nameof(Image));Changed(nameof(PlaceholderVisibility));}}
  private string _previewText;
  public string PreviewText{get=>_previewText;set{_previewText=value;Changed(nameof(PreviewText));}}
  public Visibility PlaceholderVisibility=>Image==null?Visibility.Visible:Visibility.Collapsed;
  public FamilyCard(FamilyInfo info,CategoryInfo? category){Info=info;var palette=Palette.For(category?.Color??"");Background=palette.Background;Foreground=palette.Foreground;CategoryLabel=category?.Subcategories.Find(s=>s.Id==info.Subcategory)?.Name??category?.Name??"Familia";_previewText=info.HasThumbnail?"Cargando imagen…":"Sin vista previa";}
  public event PropertyChangedEventHandler? PropertyChanged;
  private void Changed(string property){PropertyChanged?.Invoke(this,new PropertyChangedEventArgs(property));}
 }
 public sealed class TileWidthConverter:IMultiValueConverter {
  public object Convert(object[] values,Type targetType,object parameter,CultureInfo culture){
   var width=values.Length>0&&values[0] is double d&&d>0?d:240;
   var minimum=values.Length>1&&double.TryParse(System.Convert.ToString(values[1],CultureInfo.InvariantCulture),NumberStyles.Number,CultureInfo.InvariantCulture,out var size)?size:104;
   var columns=Math.Max(1,(int)((width+6)/(minimum+8)));
   return Math.Max(80,(width-2)/columns-8);
  }
  public object[] ConvertBack(object value,Type[] targetTypes,object parameter,CultureInfo culture){throw new NotSupportedException();}
 }
}
