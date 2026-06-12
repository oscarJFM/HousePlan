import { useState, useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import type { Room, RoomItem, RoomPhoto } from "@/lib/supabase";
import { ITEM_TYPES } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ItemSheet from "@/components/ItemSheet";
import RoomViewer from "@/components/RoomViewer";
import {
  ArrowLeft,
  Camera,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ImageIcon,
  Tag,
  CalendarClock,
  Box,
  LayoutGrid,
  X,
  Lightbulb,
  Paintbrush,
  Wrench,
  Zap,
  Thermometer,
  Droplets,
  Package,
  Sofa,
  Square,
  DoorOpen,
} from "lucide-react";

const TYPE_ICON: Record<string, React.ReactNode> = {
  bulb: <Lightbulb className="h-4 w-4" />,
  paint: <Paintbrush className="h-4 w-4" />,
  fixture: <Zap className="h-4 w-4" />,
  appliance: <Package className="h-4 w-4" />,
  flooring: <Square className="h-4 w-4" />,
  furniture: <Sofa className="h-4 w-4" />,
  plumbing: <Droplets className="h-4 w-4" />,
  hvac: <Thermometer className="h-4 w-4" />,
  electrical: <Zap className="h-4 w-4" />,
  window: <DoorOpen className="h-4 w-4" />,
  other: <Wrench className="h-4 w-4" />,
};

export default function RoomDetailPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [items, setItems] = useState<RoomItem[]>([]);
  const [photos, setPhotos] = useState<RoomPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoomItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<RoomItem | null>(null);
  const [deletingItemLoading, setDeletingItemLoading] = useState(false);

  const [editRoomOpen, setEditRoomOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFloorArea, setEditFloorArea] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [deleteRoomOpen, setDeleteRoomOpen] = useState(false);

  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<RoomPhoto | null>(null);
  const [deletingPhotoLoading, setDeletingPhotoLoading] = useState(false);

  const [placingMode, setPlacingMode] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (roomId) loadAll();
  }, [roomId]);

  async function loadAll() {
    setLoading(true);
    const [{ data: roomData }, { data: itemsData }, { data: photosData }] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase.from("room_items").select("*").eq("room_id", roomId).order("created_at"),
      supabase.from("room_photos").select("*").eq("room_id", roomId).order("created_at", { ascending: false }),
    ]);
    if (roomData) setRoom(roomData);
    if (itemsData) setItems(itemsData);
    if (photosData) {
      setPhotos(photosData);
      resolvePhotoUrls(photosData);
    }
    setLoading(false);
  }

  function resolvePhotoUrls(photoList: RoomPhoto[]) {
    const urls: Record<string, string> = {};
    for (const p of photoList) {
      const { data } = supabase.storage.from("room-photos").getPublicUrl(p.storage_path);
      urls[p.id] = data.publicUrl;
    }
    setPhotoUrls(urls);
  }

  async function handleEditRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    setEditLoading(true);
    const { error } = await supabase
      .from("rooms")
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        floor_area: editFloorArea ? parseFloat(editFloorArea) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", room.id);
    setEditLoading(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Room updated" });
      setEditRoomOpen(false);
      loadAll();
    }
  }

  async function handleDeleteRoom() {
    if (!room) return;
    const { error } = await supabase.from("rooms").delete().eq("id", room.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Room deleted" });
      setLocation("/dashboard");
    }
  }

  async function handleDeleteItem() {
    if (!deletingItem) return;
    setDeletingItemLoading(true);
    const { error } = await supabase.from("room_items").delete().eq("id", deletingItem.id);
    setDeletingItemLoading(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item removed" });
      setDeletingItem(null);
      loadAll();
    }
  }

  async function handleDeletePhoto() {
    if (!deletingPhoto || !user) return;
    setDeletingPhotoLoading(true);
    await supabase.storage.from("room-photos").remove([deletingPhoto.storage_path]);
    const { error } = await supabase.from("room_photos").delete().eq("id", deletingPhoto.id);
    setDeletingPhotoLoading(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Photo deleted" });
      setDeletingPhoto(null);
      loadAll();
    }
  }

  function openEditRoom() {
    if (!room) return;
    setEditName(room.name);
    setEditDescription(room.description ?? "");
    setEditFloorArea(room.floor_area?.toString() ?? "");
    setEditRoomOpen(true);
  }

  function handleViewerAddItem(x: number, y: number) {
    setPlacingMode(false);
    setPendingPosition({ x, y });
    setEditingItem(null);
    setItemSheetOpen(true);
  }

  async function handleItemSavedWithPosition() {
    if (pendingPosition) {
      const lastItem = await supabase
        .from("room_items")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (lastItem.data && pendingPosition) {
        await supabase
          .from("room_items")
          .update({ position_x: pendingPosition.x, position_y: pendingPosition.y })
          .eq("id", lastItem.data.id);
      }
      setPendingPosition(null);
    }
    loadAll();
  }

  const maintenanceSoon = items.filter((i) => {
    if (!i.next_maintenance) return false;
    const d = new Date(i.next_maintenance);
    const now = new Date();
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Room not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Rooms
            </Button>
          </Link>
          <div className="flex-1 flex items-center gap-2">
            <span className="font-semibold truncate">{room.name}</span>
            {room.floor_area && (
              <Badge variant="outline" className="text-xs hidden sm:flex">
                {room.floor_area} m²
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={openEditRoom} data-testid="button-edit-room">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteRoomOpen(true)}
              data-testid="button-delete-room"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {maintenanceSoon.length > 0 && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg px-4 py-3 flex items-center gap-2 text-sm">
            <CalendarClock className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="text-amber-800 dark:text-amber-200">
              <strong>{maintenanceSoon.length} item{maintenanceSoon.length > 1 ? "s" : ""}</strong> due for maintenance in the next 30 days
            </span>
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <LayoutGrid className="h-4 w-4 mr-1.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="photos" data-testid="tab-photos">
              <ImageIcon className="h-4 w-4 mr-1.5" />
              Photos
              {photos.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">
                  {photos.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="3d" data-testid="tab-3d">
              <Box className="h-4 w-4 mr-1.5" />
              3D View
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            {room.description && (
              <p className="text-sm text-muted-foreground">{room.description}</p>
            )}
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Items ({items.length})
              </h2>
              <Button
                size="sm"
                onClick={() => { setEditingItem(null); setItemSheetOpen(true); }}
                data-testid="button-add-item"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add item
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed rounded-xl">
                <Tag className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No items labelled yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Add labels for bulbs, paint colours, appliances — anything worth tracking.
                </p>
                <Button
                  size="sm"
                  onClick={() => { setEditingItem(null); setItemSheetOpen(true); }}
                  data-testid="button-empty-add-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add first item
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((item) => {
                  const dueDate = item.next_maintenance ? new Date(item.next_maintenance) : null;
                  const isDue = dueDate && (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;
                  return (
                    <Card
                      key={item.id}
                      className={isDue ? "border-amber-300 dark:border-amber-700" : ""}
                      data-testid={`card-item-${item.id}`}
                    >
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <div className="mt-0.5 text-muted-foreground flex-shrink-0">
                              {TYPE_ICON[item.item_type] ?? <Wrench className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {ITEM_TYPES.find((t) => t.value === item.item_type)?.label}
                              </p>
                              {(item.brand || item.model) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[item.brand, item.model].filter(Boolean).join(" · ")}
                                </p>
                              )}
                              {item.color && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  {/^#[0-9A-Fa-f]{3,6}$/.test(item.color) && (
                                    <div
                                      className="w-3 h-3 rounded-full border"
                                      style={{ backgroundColor: item.color }}
                                    />
                                  )}
                                  <span className="text-xs text-muted-foreground">{item.color}</span>
                                </div>
                              )}
                              {dueDate && (
                                <p className={`text-xs mt-1 ${isDue ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                                  Service: {dueDate.toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => { setEditingItem(item); setItemSheetOpen(true); }}
                              data-testid={`button-edit-item-${item.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeletingItem(item)}
                              data-testid={`button-delete-item-${item.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* PHOTOS TAB */}
          <TabsContent value="photos" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Photos ({photos.length})
              </h2>
              <Link href={`/rooms/${roomId}/scan`}>
                <Button size="sm" data-testid="button-scan-camera">
                  <Camera className="h-4 w-4 mr-1" />
                  Take photo
                </Button>
              </Link>
            </div>

            {photos.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed rounded-xl">
                <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">No photos yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  Capture your room from multiple angles.
                </p>
                <Link href={`/rooms/${roomId}/scan`}>
                  <Button size="sm" data-testid="button-empty-scan">
                    <Camera className="h-4 w-4 mr-1" />
                    Open camera
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative group rounded-xl overflow-hidden aspect-video bg-muted cursor-pointer"
                    onClick={() => setLightboxPhoto(photoUrls[photo.id])}
                    data-testid={`photo-${photo.id}`}
                  >
                    {photoUrls[photo.id] && (
                      <img
                        src={photoUrls[photo.id]}
                        alt="Room photo"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <button
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); setDeletingPhoto(photo); }}
                      data-testid={`button-delete-photo-${photo.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs">
                        {new Date(photo.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 3D VIEW TAB */}
          <TabsContent value="3d">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Interactive 3D room — orbit with mouse or touch. Click markers to inspect items.
                </p>
                <Button
                  size="sm"
                  variant={placingMode ? "default" : "outline"}
                  onClick={() => setPlacingMode(!placingMode)}
                  data-testid="button-place-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {placingMode ? "Cancel placing" : "Place item"}
                </Button>
              </div>
              <div className="h-[500px]">
                <RoomViewer
                  items={items}
                  placingMode={placingMode}
                  onAddItem={handleViewerAddItem}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {items.length} item{items.length !== 1 ? "s" : ""} placed · Amber markers show item positions
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Add/Edit Item Sheet */}
      <ItemSheet
        open={itemSheetOpen}
        onOpenChange={setItemSheetOpen}
        roomId={roomId}
        item={editingItem}
        onSaved={pendingPosition ? handleItemSavedWithPosition : loadAll}
      />

      {/* Edit Room Dialog */}
      <Dialog open={editRoomOpen} onOpenChange={setEditRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
            <DialogDescription>Update the details for this room.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditRoom} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-room-name">Name *</Label>
              <Input
                id="edit-room-name"
                data-testid="input-edit-room-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-room-description">Description</Label>
              <Textarea
                id="edit-room-description"
                data-testid="input-edit-room-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-room-area">Floor area (m²)</Label>
              <Input
                id="edit-room-area"
                data-testid="input-edit-room-area"
                type="number"
                value={editFloorArea}
                onChange={(e) => setEditFloorArea(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditRoomOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editLoading} data-testid="button-save-edit-room">
                {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Room Confirmation */}
      <AlertDialog open={deleteRoomOpen} onOpenChange={setDeleteRoomOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this room?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{room.name}", all its items, and all its photos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteRoom}
              data-testid="button-confirm-delete-room"
            >
              Delete room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!deletingItem} onOpenChange={(o) => !o && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingItem?.name}" will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteItem}
              disabled={deletingItemLoading}
              data-testid="button-confirm-delete-item"
            >
              {deletingItemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Photo Confirmation */}
      <AlertDialog open={!!deletingPhoto} onOpenChange={(o) => !o && setDeletingPhoto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This photo will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeletePhoto}
              disabled={deletingPhotoLoading}
              data-testid="button-confirm-delete-photo"
            >
              {deletingPhotoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
          data-testid="lightbox"
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightboxPhoto(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxPhoto}
            alt="Room photo fullscreen"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
