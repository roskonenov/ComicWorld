import Section from "./section/Section";
import homeStyle from "./Home.module.css"

import Spinner from "../spinner/Spinner";
import { useLatestComics } from "../../api/comicApi";
import useDiscountedComics from "../../hooks/useDiscountedComics";

export default function Home() {

    const [loading, latestComics] = useLatestComics(5);
    
    const [pending, discountedComics] = useDiscountedComics(5);

    if (loading || pending) {
        return <Spinner />
    }

    return (
        <main className={homeStyle.home}>
            <Section comics={latestComics} title="Latest comics" />
            <Section comics={discountedComics} title="Hot offers" />
        </main>
    );
}