import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { RoomItem } from "@/lib/supabase";
import { ITEM_TYPES } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";

interface ItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  item?: RoomItem | null;
  onSaved: () => void;
}

export default function ItemSheet({ open, onOpenChange, roomId, item, onSaved }: ItemSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("other");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [notes, setNotes] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [nextMaintenance, setNextMaintenance] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setItemType(item.item_type);
      setBrand(item.brand ?? "");
      setModel(item.model ?? "");
      setColor(item.color ?? "");
      setNotes(item.notes ?? "");
      setPurchaseDate(item.purchase_date ?? "");
      setNextMaintenance(item.next_maintenance ?? "");
    } else {
      setName("");
      setItemType("other");
      setBrand("");
      setModel("");
      setColor("");
      setNotes("");
      setPurchaseDate("");
      setNextMaintenance("");
    }
  }, [item, open]);

  async function handleSave() {
    if (!user || !name.trim()) return;
    setLoading(true);

    const payload = {
      name: name.trim(),
      item_type: itemType,
      brand: brand.trim() || null,
      model: model.trim() || null,
      color: color.trim() || null,
      notes: notes.trim() || null,
      purchase_date: purchaseDate || null,
      next_maintenance: nextMaintenance || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (item) {
      ({ error } = await supabase.from("room_items").update(payload).eq("id", item.id));
    } else {
      ({ error } = await supabase.from("room_items").insert({
        ...payload,
        room_id: roomId,
        user_id: user.id,
        position_x: 0,
        position_y: 0,
      }));
    }

    setLoading(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: item ? "Item updated" : "Item added" });
      onSaved();
      onOpenChange(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{item ? "Edit item" : "Add item"}</SheetTitle>
          <SheetDescription>
            Record details about a component or feature in this room.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 mt-6">
          <div className="space-y-2">
            <Label htmlFor="item-name">Name *</Label>
            <Input
              id="item-name"
              data-testid="input-item-name"
              placeholder="e.g. Ceiling light, North wall"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-type">Type</Label>
            <Select value={itemType} onValueChange={setItemType}>
              <SelectTrigger id="item-type" data-testid="select-item-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="item-brand">Brand</Label>
              <Input
                id="item-brand"
                data-testid="input-item-brand"
                placeholder="e.g. Philips"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-model">Model</Label>
              <Input
                id="item-model"
                data-testid="input-item-model"
                placeholder="e.g. Hue E27"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-color">Colour / finish</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="item-color"
                data-testid="input-item-color"
                placeholder="e.g. Warm white 2700K, #F5E6D3"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              {color && /^#[0-9A-Fa-f]{3,6}$/.test(color) && (
                <div
                  className="w-8 h-8 rounded border flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="item-purchase-date">Purchase date</Label>
              <Input
                id="item-purchase-date"
                data-testid="input-item-purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-next-maintenance">Next maintenance</Label>
              <Input
                id="item-next-maintenance"
                data-testid="input-item-next-maintenance"
                type="date"
                value={nextMaintenance}
                onChange={(e) => setNextMaintenance(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-notes">Notes</Label>
            <Textarea
              id="item-notes"
              data-testid="input-item-notes"
              placeholder="Any extra details — wattage, paint finish, serial number..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              data-testid="button-item-cancel"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={loading || !name.trim()}
              data-testid="button-item-save"
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save item"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
