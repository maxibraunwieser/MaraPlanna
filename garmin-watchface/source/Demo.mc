// Sample data for screenshots: only in builds made with demo.jungle
// (the normal build, monkey.jungle, leaves the (:demo) version out).

import Toybox.Application;
import Toybox.Lang;

(:typecheck(disableBackgroundCheck))
module Demo {
    // True in demo builds: sample data is shown and nothing is fetched.
    (:live)
    function active() as Boolean {
        return false;
    }

    (:demo)
    function active() as Boolean {
        Application.Storage.setValue("feed", {
            "v" => 1,
            "paired" => true,
            "date" => Feed.today(),
            "today" => {
                "label" => "TODAY · INTERVALS + CORE",
                "title" => "Intervals 5 × 1000 m",
                "line" => "9.5 km · 4:34 /km",
                "done" => false,
                "rest" => false
            },
            "next" => { "label" => "TOMORROW · EASY", "title" => "Easy run", "line" => "6 km · 5:58-6:34 /km", "done" => false, "rest" => false },
            "week" => { "done" => 23.4, "planned" => 48.0, "text" => "23 / 48 km" },
            "race" => { "days" => 170, "text" => "170 days to go" },
            "proj" => "3:25"
        });
        return true;
    }
}
