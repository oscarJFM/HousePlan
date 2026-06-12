import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import type { Room, RoomItem } from "@/lib/supabase";
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
import PanoramaViewer, { type PanoFrame } from "@/components/PanoramaViewer";
import {
  ArrowLeft,
  Camera,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Tag,
  CalendarClock,
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
  ScanLine,
  MapPin,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Helpers ────────────────────────────────────────────────────

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

/** Parse yaw/pitch from storage filename like "frame_yaw45.0_pitch-5.3_1234567890.jpg" */
function parseFrameFilename(path: string): { yaw: number; pitch: number } | null {
  const name = path.split("/").pop() ?? "";
  const yawMatch = name.match(/yaw([-\d.]+)/);
  const pitchMatch = name.match(/pitch([-\d.]+)/);
  if (!yawMatch || !pitchMatch) return null;
  return { yaw: parseFloat(yawMatch[1]), pitch: parseFloat(pitchMatch[1]) };
}

/** Strip the internal Z prefix we store in notes: "__pz:-3.14__" */
function parseItemNotes(notes: string | null): { displayNotes: string; pz: number } {
  if (!notes) return { displayNotes: "", pz: 0 };
  const match = notes.match(/^__pz:([-\d.]+)__\n?/);
  if (match) return { displayNotes: notes.replace(match[0], ""), pz: parseFloat(match[1]) };
  return { displayNotes: notes, pz: 0 };
}

function encodeItemNotes(pz: number, userNotes: string) {
  return `__pz:${pz}__\n${userNotes}`;
}

// ── Inline label form (shown as overlay after click in panorama) ──
interface LabelFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string; itemType: string; brand: string; model: string;
    color: string; notes: string; purchaseDate: string; nextMaintenance: string;
  }) => Promise<void>;
}

function LabelForm({ open, onClose, onSave }: LabelFormProps) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("other");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [nextMaintenance, setNextMaintenance] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(""); setItemType("other"); setBrand(""); setModel("");
      setColor(""); setNotes(""); setPurchaseDate(""); setNextMaintenance("");
    }
  }, [open]);

  if (!open) return null;

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name, itemType, brand, model, color, notes, purchaseDate, nextMaintenance });
    setSaving(false);
  }

  return (
    <div className="absolute inset-y-0 right-0 w-80 bg-card border-l shadow-xl z-20 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Add label here</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        <div className="space-y-1.5">
          <Label htmlFor="lf-name" className="text-xs">Name *</Label>
          <Input id="lf-name" placeholder="e.g. Mirror, Ceiling light" value={name}
            onChange={(e) => setName(e.target.value)} data-testid="input-label-name" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={itemType} onValueChange={setItemType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Brand</Label>
            <Input placeholder="e.g. IKEA" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Input placeholder="e.g. Kallax" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Colour / finish</Label>
          <Input placeholder="e.g. Warm white, #F5E6D3" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Purchase date</Label>
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Next service</Label>
            <Input type="date" value={nextMaintenance} onChange={(e) => setNextMaintenance(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Textarea placeholder="Wattage, finish, serial number…" value={notes}
            onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      <div className="p-4 border-t flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" disabled={saving || !name.trim()} onClick={handleSave}
          data-testid="button-label-save">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Place label"}
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function RoomDetailPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [room, setRoom] = useState<Room | null>(null);
  const [items, setItems] = useState<RoomItem[]>([]);
  const [panoFrames, setPanoFrames] = useState<PanoFrame[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit room dialog
  const [editRoomOpen, setEditRoomOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFloorArea, setEditFloorArea] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Delete room
  const [deleteRoomOpen, setDeleteRoomOpen] = useState(false);

  // Delete item
  const [deletingItem, setDeletingItem] = useState<RoomItem | null>(null);
  const [deletingItemLoading, setDeletingItemLoading] = useState(false);

  // Edit item dialog
  const [editingItem, setEditingItem] = useState<RoomItem | null>(null);

  // Panorama label placement
  const [placingMode, setPlacingMode] = useState(false);
  const [pendingLabelPos, setPendingLabelPos] = useState<{ x: number; y: number; z: number } | null>(null);
  const [labelFormOpen, setLabelFormOpen] = useState(false);

  // ── Data loading ──

  useEffect(() => { loadAll(); }, [roomId]);

  async function loadAll() {
    setLoading(true);
    const [{ data: roomData }, { data: itemsData }] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).single(),
      supabase.from("room_items").select("*").eq("room_id", roomId).order("created_at"),
    ]);
    if (roomData) setRoom(roomData);
    if (itemsData) setItems(itemsData);
    await loadPanoFrames();
    setLoading(false);
  }

  async function loadPanoFrames() {
    const { data: photos } = await supabase
      .from("room_photos")
      .select("storage_path")
      .eq("room_id", roomId);
    if (!photos || photos.length === 0) { setPanoFrames([]); return; }

    const frames: PanoFrame[] = [];
    for (const p of photos) {
      const parsed = parseFrameFilename(p.storage_path);
      if (!parsed) continue;
      const { data } = supabase.storage.from("room-photos").getPublicUrl(p.storage_path);
      frames.push({ url: data.publicUrl, yaw: parsed.yaw, pitch: parsed.pitch });
    }
    setPanoFrames(frames);
  }

  // ── Panorama label ──

  function handlePanoClick(x: number, y: number, z: number) {
    if (!placingMode) return;
    setPendingLabelPos({ x, y, z });
    setLabelFormOpen(true);
  }

  async function handleLabelSave(data: {
    name: string; itemType: string; brand: string; model: string;
    color: string; notes: string; purchaseDate: string; nextMaintenance: string;
  }) {
    if (!user || !pendingLabelPos) return;
    const { error } = await supabase.from("room_items").insert({
      room_id: roomId,
      user_id: user.id,
      name: data.name.trim(),
      item_type: data.itemType,
      brand: data.brand.trim() || null,
      model: data.model.trim() || null,
      color: data.color.trim() || null,
      notes: data.notes.trim() ? encodeItemNotes(pendingLabelPos.z, data.notes.trim()) : encodeItemNotes(pendingLabelPos.z, ""),
      purchase_date: data.purchaseDate || null,
      next_maintenance: data.nextMaintenance || null,
      position_x: pendingLabelPos.x,
      position_y: pendingLabelPos.y,
    });
    if (error) {
      toast({ title: "Failed to save label", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Label placed!" });
      setLabelFormOpen(false);
      setPlacingMode(false);
      setPendingLabelPos(null);
      loadAll();
    }
  }

  // ── Room edit / delete ──

  function openEditRoom() {
    if (!room) return;
    setEditName(room.name);
    setEditDescription(room.description ?? "");
    setEditFloorArea(room.floor_area?.toString() ?? "");
    setEditRoomOpen(true);
  }

  async function handleEditRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    setEditLoading(true);
    const { error } = await supabase.from("rooms").update({
      name: editName.trim(),
      description: editDescription.trim() || null,
      floor_area: editFloorArea ? parseFloat(editFloorArea) : null,
      updated_at: new Date().toISOString(),
    }).eq("id", room.id);
    setEditLoading(false);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Room updated" }); setEditRoomOpen(false); loadAll(); }
  }

  async function handleDeleteRoom() {
    if (!room) return;
    const { error } = await supabase.from("rooms").delete().eq("id", room.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Room deleted" }); setLocation("/dashboard"); }
  }

  // ── Item delete ──

  async function handleDeleteItem() {
    if (!deletingItem) return;
    setDeletingItemLoading(true);
    const { error } = await supabase.from("room_items").delete().eq("id", deletingItem.id);
    setDeletingItemLoading(false);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Item removed" }); setDeletingItem(null); loadAll(); }
  }

  // ── Inline item edit ──

  const [editItemName, setEditItemName] = useState("");
  const [editItemType, setEditItemType] = useState("other");
  const [editItemBrand, setEditItemBrand] = useState("");
  const [editItemModel, setEditItemModel] = useState("");
  const [editItemColor, setEditItemColor] = useState("");
  const [editItemNotes, setEditItemNotes] = useState("");
  const [editItemPurchaseDate, setEditItemPurchaseDate] = useState("");
  const [editItemNextMaintenance, setEditItemNextMaintenance] = useState("");
  const [editItemLoading, setEditItemLoading] = useState(false);

  function openEditItem(item: RoomItem) {
    const { displayNotes } = parseItemNotes(item.notes);
    setEditItemName(item.name);
    setEditItemType(item.item_type);
    setEditItemBrand(item.brand ?? "");
    setEditItemModel(item.model ?? "");
    setEditItemColor(item.color ?? "");
    setEditItemNotes(displayNotes);
    setEditItemPurchaseDate(item.purchase_date ?? "");
    setEditItemNextMaintenance(item.next_maintenance ?? "");
    setEditingItem(item);
  }

  async function handleSaveEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    const { pz } = parseItemNotes(editingItem.notes);
    setEditItemLoading(true);
    const { error } = await supabase.from("room_items").update({
      name: editItemName.trim(),
      item_type: editItemType,
      brand: editItemBrand.trim() || null,
      model: editItemModel.trim() || null,
      color: editItemColor.trim() || null,
      notes: editItemNotes.trim() ? encodeItemNotes(pz, editItemNotes.trim()) : (pz !== 0 ? encodeItemNotes(pz, "") : null),
      purchase_date: editItemPurchaseDate || null,
      next_maintenance: editItemNextMaintenance || null,
      updated_at: new Date().toISOString(),
    }).eq("id", editingItem.id);
    setEditItemLoading(false);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Label updated" }); setEditingItem(null); loadAll(); }
  }

  // ── Maintenance banner ──

  const maintenanceSoon = items.filter((i) => {
    if (!i.next_maintenance) return false;
    const d = new Date(i.next_maintenance);
    return (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;
  });

  // ── Render ──

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-96 w-full" />
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
      {/* Header */}
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
              <Badge variant="outline" className="text-xs hidden sm:flex">{room.floor_area} m²</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={openEditRoom} data-testid="button-edit-room">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteRoomOpen(true)} data-testid="button-delete-room">
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
              <strong>{maintenanceSoon.length} item{maintenanceSoon.length > 1 ? "s" : ""}</strong> due for maintenance within 30 days
            </span>
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <LayoutGrid className="h-4 w-4 mr-1.5" />
              Labels
              {items.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">{items.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="panorama" data-testid="tab-panorama">
              <ScanLine className="h-4 w-4 mr-1.5" />
              3D Panorama
              {panoFrames.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs h-4 px-1">{panoFrames.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── LABELS TAB ── */}
          <TabsContent value="overview" className="space-y-4">
            {room.description && (
              <p className="text-sm text-muted-foreground">{room.description}</p>
            )}

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Labelled items ({items.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Place labels directly in the 3D panorama →
              </p>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed rounded-xl">
                <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No labels yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-5">
                  Scan the room first, then click any surface in the 3D panorama to pin a label there.
                </p>
                <Link href={`/rooms/${roomId}/scan`}>
                  <Button size="sm">
                    <Camera className="h-4 w-4 mr-1.5" />
                    Scan this room
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((item) => {
                  const { displayNotes } = parseItemNotes(item.notes);
                  const dueDate = item.next_maintenance ? new Date(item.next_maintenance) : null;
                  const isDue = dueDate && (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;
                  return (
                    <Card key={item.id}
                      className={isDue ? "border-amber-300 dark:border-amber-700" : ""}
                      data-testid={`card-item-${item.id}`}>
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
                                    <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: item.color }} />
                                  )}
                                  <span className="text-xs text-muted-foreground">{item.color}</span>
                                </div>
                              )}
                              {displayNotes && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{displayNotes}</p>
                              )}
                              {dueDate && (
                                <p className={`text-xs mt-1 ${isDue ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                                  Service: {dueDate.toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => openEditItem(item)}
                              data-testid={`button-edit-item-${item.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeletingItem(item)}
                              data-testid={`button-delete-item-${item.id}`}>
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

          {/* ── PANORAMA TAB ── */}
          <TabsContent value="panorama">
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {panoFrames.length > 0
                    ? "Explore the scan · click a surface to pin a label"
                    : "No scan yet — scan the room to build the 3D view"}
                </p>
                <div className="flex gap-2">
                  {panoFrames.length > 0 && (
                    <Button size="sm" variant={placingMode ? "default" : "outline"}
                      onClick={() => { setPlacingMode(!placingMode); setLabelFormOpen(false); }}
                      data-testid="button-toggle-place">
                      <MapPin className="h-4 w-4 mr-1" />
                      {placingMode ? "Cancel" : "Add label"}
                    </Button>
                  )}
                  <Link href={`/rooms/${roomId}/scan`}>
                    <Button size="sm" variant={panoFrames.length > 0 ? "outline" : "default"}
                      data-testid="button-start-scan">
                      <Camera className="h-4 w-4 mr-1" />
                      {panoFrames.length > 0 ? "Re-scan" : "Scan room"}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Panorama canvas + label form side panel */}
              <div className="relative h-[520px] rounded-xl overflow-hidden">
                <PanoramaViewer
                  frames={panoFrames}
                  items={items}
                  placingMode={placingMode}
                  onPlaceLabel={handlePanoClick}
                />
                <LabelForm
                  open={labelFormOpen}
                  onClose={() => { setLabelFormOpen(false); setPlacingMode(false); setPendingLabelPos(null); }}
                  onSave={handleLabelSave}
                />
              </div>

              {panoFrames.length > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {panoFrames.length} scan frame{panoFrames.length !== 1 ? "s" : ""} ·{" "}
                  {items.length} label{items.length !== 1 ? "s" : ""} pinned
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* ── Edit Room Dialog ── */}
      <Dialog open={editRoomOpen} onOpenChange={setEditRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit room</DialogTitle>
            <DialogDescription>Update the details for this room.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditRoom} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required data-testid="input-edit-room-name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Floor area (m²)</Label>
              <Input type="number" value={editFloorArea} onChange={(e) => setEditFloorArea(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditRoomOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={editLoading} data-testid="button-save-edit-room">
                {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Item Dialog ── */}
      <Dialog open={!!editingItem} onOpenChange={(o) => !o && setEditingItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit label</DialogTitle>
            <DialogDescription>Update details for "{editingItem?.name}"</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEditItem} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={editItemName} onChange={(e) => setEditItemName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={editItemType} onValueChange={setEditItemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Brand</Label>
                <Input value={editItemBrand} onChange={(e) => setEditItemBrand(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={editItemModel} onChange={(e) => setEditItemModel(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Colour / finish</Label>
              <Input value={editItemColor} onChange={(e) => setEditItemColor(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Purchase date</Label>
                <Input type="date" value={editItemPurchaseDate} onChange={(e) => setEditItemPurchaseDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Next service</Label>
                <Input type="date" value={editItemNextMaintenance} onChange={(e) => setEditItemNextMaintenance(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editItemNotes} onChange={(e) => setEditItemNotes(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button type="submit" disabled={editItemLoading}>
                {editItemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Room Confirmation ── */}
      <AlertDialog open={deleteRoomOpen} onOpenChange={setDeleteRoomOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this room?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{room.name}", all labels, and all scan data. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteRoom} data-testid="button-confirm-delete-room">
              Delete room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Item Confirmation ── */}
      <AlertDialog open={!!deletingItem} onOpenChange={(o) => !o && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove label?</AlertDialogTitle>
            <AlertDialogDescription>"{deletingItem?.name}" will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteItem} disabled={deletingItemLoading} data-testid="button-confirm-delete-item">
              {deletingItemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
