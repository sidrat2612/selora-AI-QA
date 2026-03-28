import { useState } from "react";
import { X, Download, ZoomIn, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

interface Screenshot {
  id: string;
  url: string;
  step: string;
  timestamp: string;
  status: "pass" | "fail" | "info";
}

interface ScreenshotGalleryProps {
  screenshots: Screenshot[];
}

export function ScreenshotGallery({ screenshots }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
  };

  const closeLightbox = () => {
    setSelectedIndex(null);
  };

  const navigatePrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const navigateNext = () => {
    if (selectedIndex !== null && selectedIndex < screenshots.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const handleDownload = (screenshot: Screenshot) => {
    if (!screenshot.url) return;
    const link = document.createElement("a");
    link.href = screenshot.url;
    link.download = `screenshot-${screenshot.id}.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {screenshots.map((screenshot, index) => (
          <Card 
            key={screenshot.id}
            className="group relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openLightbox(index)}
          >
            <div className="aspect-video bg-muted relative">
              {screenshot.url ? (
                <img src={screenshot.url} alt={screenshot.step} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <span className="text-xs">No image available</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Badge 
                  variant={screenshot.status === "pass" ? "default" : screenshot.status === "fail" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {screenshot.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{screenshot.timestamp}</span>
              </div>
              <p className="text-sm font-medium text-foreground truncate">{screenshot.step}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedIndex !== null && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={closeLightbox}
          >
            <X className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-16 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              if (selectedIndex !== null) handleDownload(screenshots[selectedIndex]!);
            }}
          >
            <Download className="h-6 w-6" />
          </Button>

          {selectedIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                navigatePrev();
              }}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
          )}

          {selectedIndex < screenshots.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                navigateNext();
              }}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          )}

          <div 
            className="max-w-6xl max-h-[90vh] bg-muted rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedIndex !== null && screenshots[selectedIndex]?.url ? (
              <img
                src={screenshots[selectedIndex]!.url}
                alt={screenshots[selectedIndex]!.step}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="aspect-video flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No image available</p>
              </div>
            )}
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white text-sm">
            {selectedIndex + 1} / {screenshots.length}
          </div>
        </div>
      )}
    </>
  );
}
