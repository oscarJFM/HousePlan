import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function NewRoomPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [floorArea, setFloorArea] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("rooms")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        floor_area: floorArea ? parseFloat(floorArea) : null,
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      toast({ title: "Failed to create room", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Room created!" });
      setLocation(`/rooms/${data.id}`);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <span className="font-semibold">New Room</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Add a room</CardTitle>
            <CardDescription>
              Give your room a name. You can add photos and label items after.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="room-name">Room name *</Label>
                <Input
                  id="room-name"
                  data-testid="input-room-name"
                  placeholder="e.g. Living Room, Master Bathroom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-description">Description</Label>
                <Textarea
                  id="room-description"
                  data-testid="input-room-description"
                  placeholder="Any notes about this room..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-area">Floor area (m²)</Label>
                <Input
                  id="room-area"
                  data-testid="input-room-area"
                  type="number"
                  placeholder="e.g. 25"
                  value={floorArea}
                  onChange={(e) => setFloorArea(e.target.value)}
                  min="0"
                  step="0.1"
                />
              </div>
            </CardContent>
            <CardFooter className="gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !name.trim()} data-testid="button-create-room">
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  "Create Room"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}
