// Was man starten kann: die heutige Einheit aus MaraPlanna (-1), die Lauftypen mit bekannter Pace
// (1..7 wie Pace.ZONES) und der freie Lauf (0). Gebraucht vom Trainingsmenü und vom Startbildschirm.

import Toybox.Lang;

module Choices {
    const TODAY = -1;
    const FREE = 0;

    function list(zones as PaceZones?, workout as Workout?) as Array<Number> {
        var out = [] as Array<Number>;
        if (workout != null) {
            out.add(TODAY);
        }
        for (var i = 1; i < Pace.ZONES.size(); i++) {
            if (zones != null && (zones as PaceZones).range(i) != null) {
                out.add(i);
            }
        }
        out.add(FREE);
        return out;
    }
}
