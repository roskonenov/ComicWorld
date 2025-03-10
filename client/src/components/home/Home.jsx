import Section from "./section/Section";

import homeStyle from "./Home.module.css"

export default function Home() {
    return (
        <main className={homeStyle.home}>
            <Section />
        </main>
    );
}