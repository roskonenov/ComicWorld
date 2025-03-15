import Section from "./section/Section";
import homeStyle from "./Home.module.css"

import { useState } from "react";
import useGetResources from "../../hooks/useGetResource";
import Spinner from "../spinner/Spinner";

const baseUrl = 'http://localhost:3030/jsonstore/comics-info';

export default function Home() {

    const [loading, comicsData] = useGetResources(baseUrl);


    const latestComics = comicsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const discountedComics = comicsData.filter(comic => comic.oldPrice).slice(0, 5);

    if (loading) {
        return <Spinner />
    }

    return (
        <main className={homeStyle.home}>
            <Section comics={latestComics} title="Latest comics" />
            <Section comics={discountedComics} title="Hot offers" />
        </main>
    );
}